import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { BranchManager } from '../../src/utils/branchManager';

// Mock logger to avoid console noise during tests
mock.module('../../src/utils/logger', () => ({
  default: class MockLogger {
    error() { }
    info() { }
    section() { }
  }
}));

describe('BranchManager', () => {
  let branchManager: BranchManager;
  const mockOwner = 'test-owner';
  const mockRepo = 'test-repo';
  const mockToken = 'test-token';

  beforeEach(() => {
    // Reset process event listeners
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');

    // Restore default mock
    mock.module('@octokit/rest', () => ({
      Octokit: class MockOctokit {
        constructor() {
          return {
            git: {
              getRef: async () => ({
                data: { object: { sha: 'mock-sha' } }
              }),
              createRef: async () => ({}),
              deleteRef: async () => ({})
            }
          };
        }
      }
    }));

    branchManager = new BranchManager(mockOwner, mockRepo, mockToken);
  });

  describe('createBranch', () => {
    test('should create and track a new branch', async () => {
      const branchName = 'test-branch';

      await branchManager.createBranch(branchName);
      expect(branchManager.getActiveBranches()).toContain(branchName);
    });

    test('should handle branch creation failure', async () => {
      const branchName = 'test-branch';

      // Override the default mock for this specific test
      mock.module('@octokit/rest', () => ({
        Octokit: class MockOctokit {
          constructor() {
            return {
              git: {
                getRef: async () => {
                  throw new Error('API Error');
                }
              }
            };
          }
        }
      }));

      const failingBranchManager = new BranchManager(mockOwner, mockRepo, mockToken);
      await expect(failingBranchManager.createBranch(branchName)).rejects.toThrow('API Error');
      expect(failingBranchManager.getActiveBranches()).not.toContain(branchName);
    });
  });

  describe('deleteBranch', () => {
    test('should delete and untrack a branch', async () => {
      const branchName = 'test-branch';
      let deleteRefCalled = false;

      // Override the default mock for this specific test
      mock.module('@octokit/rest', () => ({
        Octokit: class MockOctokit {
          constructor() {
            return {
              git: {
                getRef: async () => ({
                  data: { object: { sha: 'mock-sha' } }
                }),
                createRef: async () => ({}),
                deleteRef: async () => {
                  deleteRefCalled = true;
                  return {};
                }
              }
            };
          }
        }
      }));

      const testManager = new BranchManager(mockOwner, mockRepo, mockToken);
      await testManager.createBranch(branchName);
      expect(testManager.getActiveBranches()).toContain(branchName);

      await testManager.deleteBranch(branchName);
      expect(deleteRefCalled).toBe(true);
      expect(testManager.getActiveBranches()).not.toContain(branchName);
    });

    test('should handle deletion failure gracefully', async () => {
      const branchName = 'test-branch';

      // Override the default mock for this specific test
      mock.module('@octokit/rest', () => ({
        Octokit: class MockOctokit {
          constructor() {
            return {
              git: {
                getRef: async () => ({
                  data: { object: { sha: 'mock-sha' } }
                }),
                createRef: async () => ({}),
                deleteRef: async () => {
                  throw new Error('Deletion failed');
                }
              }
            };
          }
        }
      }));

      const failingBranchManager = new BranchManager(mockOwner, mockRepo, mockToken);
      await failingBranchManager.createBranch(branchName);
      await failingBranchManager.deleteBranch(branchName);
      // Branch should still be removed from tracking even if API call fails
      expect(failingBranchManager.getActiveBranches()).not.toContain(branchName);
    });
  });

  describe('cleanup', () => {
    test('should cleanup all active branches on process termination', async () => {
      const branches = [ 'branch1', 'branch2', 'branch3' ];
      const deletedBranches = new Set<string>();

      // Override the default mock for this specific test
      mock.module('@octokit/rest', () => ({
        Octokit: class MockOctokit {
          constructor() {
            return {
              git: {
                getRef: async () => ({
                  data: { object: { sha: 'mock-sha' } }
                }),
                createRef: async () => ({}),
                deleteRef: async ({ ref }: { ref: string }) => {
                  deletedBranches.add(ref.replace('heads/', ''));
                  return {};
                }
              }
            };
          }
        }
      }));

      const cleanupManager = new BranchManager(mockOwner, mockRepo, mockToken);
      for (const branch of branches) {
        await cleanupManager.createBranch(branch);
      }

      // Simulate process termination
      process.emit('SIGTERM');

      // Wait for cleanup promises to resolve
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify all branches were deleted
      expect(deletedBranches.size).toBe(branches.length);
      branches.forEach(branch => {
        expect(deletedBranches.has(branch)).toBe(true);
      });
    });

    test('should handle cleanup failures gracefully', async () => {
      const branchName = 'test-branch';
      let errorLogged = false;

      // Override the default mock for this specific test
      mock.module('@octokit/rest', () => ({
        Octokit: class MockOctokit {
          constructor() {
            return {
              git: {
                getRef: async () => ({
                  data: { object: { sha: 'mock-sha' } }
                }),
                createRef: async () => ({}),
                deleteRef: async () => {
                  throw new Error('Cleanup failed');
                }
              }
            };
          }
        }
      }));

      // Mock logger
      mock.module('../../src/utils/logger', () => ({
        default: class MockLogger {
          error() { errorLogged = true; }
          info() { }
          section() { }
        }
      }));

      const failingCleanupManager = new BranchManager(mockOwner, mockRepo, mockToken);
      await failingCleanupManager.createBranch(branchName);
      process.emit('SIGTERM');

      // Wait for cleanup promises to resolve
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorLogged).toBe(true);
      expect(failingCleanupManager.getActiveBranches()).not.toContain(branchName);
    });
  });
}); 