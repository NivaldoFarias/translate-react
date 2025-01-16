import { GitHubService } from "../services/github";

const github = new GitHubService();

const filteredTree = await github.getRepositoryTree("main", true);

console.table(filteredTree.map(({ path, type, url }) => ({ path, type, url })));
