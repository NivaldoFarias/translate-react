# Documentation

Technical documentation for the `translate-react` project. This directory contains detailed information about system architecture, execution workflow, error handling, and debugging procedures.

## Table of Contents

- [Documentation](#documentation)
  - [Table of Contents](#table-of-contents)
  - [Architecture Documentation](#architecture-documentation)
  - [Workflow Documentation](#workflow-documentation)
  - [Error Handling Documentation](#error-handling-documentation)
  - [Debugging Documentation](#debugging-documentation)
  - [Additional Resources](#additional-resources)
    - [Project Files](#project-files)
    - [GitHub Resources](#github-resources)
    - [Development Guidelines](#development-guidelines)
  - [Document Index](#document-index)
  - [Navigation Tips](#navigation-tips)

## Architecture Documentation

- **File**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Purpose**: Comprehensive technical documentation of the system architecture, service design patterns, and implementation details.
- **Contents**:
  - **System Overview**: High-level architecture diagram showing component relationships
  - **Service-Oriented Architecture**: Detailed breakdown of the core services:
    - Runner Service (workflow orchestration)
    - GitHub Service (API integration and repository operations)
    - Translator Service (LLM translation engine)
    - Language Detector Service (content analysis)
    - Cache Service (runtime state management)
  - **Service Hierarchy**: Class diagrams showing inheritance patterns and relationships
  - **Error Handling Architecture**: Proxy pattern implementation and error transformation pipeline
  - **Data Flow Diagrams**: Visual representation of discovery and translation phases
  - **Design Patterns**: Implementation details for inheritance and error handling patterns
  - **Performance Considerations**: Optimization strategies and bottleneck mitigation
- **Best For**:
  - Understanding how the system is structured
  - Learning about service responsibilities and interactions
  - Implementing new features or extending existing services
  - Debugging complex service integration issues

## Workflow Documentation

- **File**: [WORKFLOW.md](./WORKFLOW.md)
- **Purpose**: Detailed execution workflow with timing analysis, performance bottlenecks, and stage-by-stage operation breakdown.
- **Contents**:
  - **Six Execution Stages**:
    1. Initialization (environment validation, service setup)
    2. Repository Setup (token verification, fork synchronization)
    3. Content Discovery (tree fetching, file filtering)
    4. File Filtering (content fetching, language detection)
    5. Batch Translation (LLM processing, branch management)
    6. Progress Reporting (issue updates, statistics)
  - **Timing Analysis**: Performance baseline with bottleneck identification (14s file filtering = 74.5% of execution time)
  - **Detailed Stage Workflows**: Sequence diagrams and flowcharts for each phase
  - **Data Structures**: TypeScript interfaces for files, results, and state
  - **Error Recovery Flow**: State machine diagram for error handling
  - **Development vs Production Mode**: Behavioral differences and configuration
- **Best For**:
  - Understanding the complete execution flow
  - Identifying performance bottlenecks
  - Optimizing workflow stages
  - Debugging workflow issues
  - Planning architecture improvements

## Error Handling Documentation

- **File**: [ERROR_HANDLING.md](./ERROR_HANDLING.md)
- **Purpose**: Error taxonomy, recovery mechanisms, and debugging strategies for the custom error handling system.
- **Contents**:
  - **Error Hierarchy**: Custom error classes and their relationships
  - **Error Codes**: Specific error types (GitHub, LLM, validation, etc.)
  - **Recovery Mechanisms**: Retry logic, cleanup procedures, and graceful degradation
  - **Error Context**: Enrichment strategies for debugging information
  - **Stack Trace Filtering**: Removing wrapper frames for cleaner debugging
  - **Logging Strategy**: JSONL format and structured error logs
- **Best For**:
  - Understanding error types and their meanings
  - Implementing error handling for new features
  - Debugging production errors
  - Analyzing error patterns from logs
  - Designing recovery strategies

## Debugging Documentation

- **File**: [DEBUGGING.md](./DEBUGGING.md)
- **Purpose**: Troubleshooting guides, diagnostic procedures, and common issue resolution.
- **Contents**:
  - **Common Issues**: Environment validation, GitHub permissions, API rate limits
  - **Diagnostic Commands**: Log analysis, error filtering, pattern detection
  - **Debug Mode**: Enabling verbose logging and tracing
  - **Log Analysis**: JSONL parsing and querying techniques
  - **Development Tools**: Testing strategies and debugging techniques
  - **Production Troubleshooting**: Issue resolution in production environments
- **Best For**:
  - Resolving common errors and issues
  - Analyzing production problems
  - Setting up development debugging workflows
  - Learning log analysis techniques
  - Quick issue resolution

## Additional Resources

### Project Files

- [**Main README**](../README.md): Quick start guide and configuration overview
- [**Environment Example**](../.env.example): Configuration template with all variables
- [**Environment Schema**](../src/utils/env.util.ts): Runtime validation schema (Zod)
- [**Constants**](../src/utils/constants.util.ts): Default values and application constants

### GitHub Resources

- [**Issues**](https://github.com/NivaldoFarias/translate-react/issues): Bug reports and feature requests
- [**Discussions**](https://github.com/NivaldoFarias/translate-react/discussions): Questions and support
- [**Pull Requests**](https://github.com/NivaldoFarias/translate-react/pulls): Code contributions

### Development Guidelines

- [**TypeScript Instructions**](../.github/instructions/typescript.instructions.md): TypeScript coding standards
- [**JSDoc Instructions**](../.github/instructions/jsdocs.instructions.md): Documentation standards
- [**Testing Instructions**](../.github/instructions/testing.instructions.md): Testing standards
- [**Commit Instructions**](../.github/instructions/commit.instructions.md): Commit message conventions
- [**Markdown Instructions**](../.github/instructions/markdown.instructions.md): Markdown formatting standards

## Document Index

Quick reference table for all documentation files:

| Document                                 | Primary Focus   | Key Topics                                    |
| ---------------------------------------- | --------------- | --------------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md)     | System Design   | Services, patterns, error handling, data flow |
| [WORKFLOW.md](./WORKFLOW.md)             | Execution Flow  | Stages, timing, bottlenecks, performance      |
| [ERROR_HANDLING.md](./ERROR_HANDLING.md) | Error System    | Error types, recovery, logging, debugging     |
| [DEBUGGING.md](./DEBUGGING.md)           | Troubleshooting | Common issues, diagnostics, log analysis      |

## Navigation Tips

1. **Start with ARCHITECTURE.md** if you're new to the codebase and want to understand how everything fits together
2. **Use WORKFLOW.md** to understand the execution flow and identify where specific operations happen
3. **Reference ERROR_HANDLING.md** when implementing new features that need error handling
4. **Consult DEBUGGING.md** when troubleshooting issues or analyzing production errors

For quick setup and configuration, refer to the [project's root `README.md` file](../README.md).
