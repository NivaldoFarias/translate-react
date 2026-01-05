# Debugging Translation Workflow

This document provides guidance on debugging the translation workflow, particularly for diagnosing issues with chunked translations.

## Enabling Debug Logging

The application uses `pino` logger with configurable log levels. To enable detailed debug logging:

### Development Mode

Set the `LOG_LEVEL` environment variable to `debug`:

```bash
LOG_LEVEL="debug" bun run dev
```

### Production Mode

```bash
LOG_LEVEL="debug" bun run start
```

### Via Environment File

Add to your `.env.dev` or `.env` file:

```ini
LOG_LEVEL="debug"
```

Then run normally:

```bash
bun run dev
```

## Debug Log Output

With `LOG_LEVEL="debug"`, you'll see comprehensive logging including:

### Translation Workflow

- **File Processing Start**: Initial file metadata and content length
- **Branch Creation**: Branch ref and creation duration
- **Translation Initiation**: Content size, estimated tokens, chunking decision
- **Chunk Processing** (if applicable):
  - Individual chunk sizes and token estimates
  - Translation duration per chunk
  - Size ratios and translation metrics
  - Chunk reassembly details
- **Post-Translation Validation**: Validation checks and results
- **Commit Operation**: Commit duration and status
- **PR Creation**: PR number and total workflow timing

### Chunked Translation Details

For files requiring chunking, debug logs include:

```json
{
	"totalChunks": 4,
	"originalContentLength": 30500,
	"chunkSizes": [13796, 3106, 15498, 4529]
}
```

Each chunk shows:

```json
{
	"chunkIndex": 1,
	"totalChunks": 4,
	"chunkSize": 13796,
	"estimatedTokens": 8686,
	"translatedLength": 13796,
	"sizeRatio": "1.05",
	"durationMs": 4200
}
```

### Workflow Timing

Complete timing breakdown for each file:

```json
{
	"filename": "react-19-upgrade-guide.md",
	"prNumber": 613,
	"timing": {
		"branchMs": 300,
		"translationMs": 18500,
		"commitMs": 1200,
		"prMs": 800,
		"totalMs": 20800
	}
}
```

## Analyzing Timing Issues

### Expected Sequence

For chunked translations, the logs should follow this order:

1. File processing start
2. Branch creation
3. Chunking workflow start
4. Chunk 1/N translation
5. Chunk 2/N translation
6. ...
7. Chunk N/N translation
8. Reassembly completed
9. Translation validation
10. Commit operation
11. PR creation

### Detecting Race Conditions

Look for timing anomalies in the logs:

```bash
# Search for commit operations in debug logs
grep "Commit completed" logs/*.log

# Check chunk completion times
grep "Chunk translated successfully" logs/*.log

# Verify reassembly completion
grep "Content reassembly completed" logs/*.log
```

### Key Indicators of Issues

**Chunk Count Mismatch**:

```json
{
	"level": 50,
	"expectedChunks": 4,
	"actualChunks": 3,
	"msg": "Critical: Chunk count mismatch detected"
}
```

**Validation Failure**:

```json
{
	"level": 50,
	"originalHeadings": 45,
	"translatedHeadings": 0,
	"msg": "Translation lost all markdown headings"
}
```

**Size Ratio Warning**:

```json
{
	"level": 40,
	"sizeRatio": "0.35",
	"msg": "Translation size ratio outside expected range (0.5-2.0)"
}
```

## Troubleshooting Chunked Translations

### Issue: Incomplete Translation

#### Symptoms:

- Final PR contains truncated content
- Chunk count mismatch errors
- Size ratio significantly below 0.5

#### Debug Steps:

1. Enable debug logging
2. Run translation for single file
3. Check logs for:

- Total chunks vs. translated chunks
- Individual chunk completion times
- Commit timestamp vs. last chunk completion

### Issue: Race Condition Suspected

#### Symptoms:

- Commit occurs before all chunks finish
- Missing content in final translation
- Inconsistent results between runs

#### Debug Steps:

##### 1. Review timing logs with millisecond precision:

```bash
LOG_LEVEL="debug" bun run dev 2>&1 | grep -E "(Chunk.*translated|Commit completed|reassembly)"
```

##### 2. Verify sequential processing:

- Each chunk should complete before next starts
- Reassembly should complete before commit
- All timings should be additive

##### 3. Check for concurrent file processing:

```bash
grep "Starting file processing" logs/*.log | sort
```

## Validation Checks

The workflow includes multiple validation checkpoints:

### 1. Chunk Count Validation

Ensures `translatedChunks.length === originalChunks.length`

**Location**: `TranslatorService.translateWithChunking()`

### 2. Content Emptiness Check

Verifies translated content is not empty or whitespace-only

**Location**: `TranslatorService.validateTranslation()`

### 3. Size Ratio Validation

Warns if translation size ratio is outside 0.5-2.0x range

**Location**: `TranslatorService.validateTranslation()`

### 4. Markdown Structure Preservation

Checks that headings are preserved in translation

**Location**: `TranslatorService.validateTranslation()`

## Log File Locations

Logs are stored in:

```plaintext
logs/YYYY-MM-DDTHH:MM:SS.sssZ.pino.log
```

## Advanced Debugging

### Single File Test

To debug a specific problematic file:

1. Modify the filter in runner to process only that file
2. Enable debug logging
3. Run and analyze complete workflow

### Chunk Boundary Analysis

To understand where chunks are split:

```typescript
// Add to chunkContent() temporarily
logger.debug(
	{
		chunkIndex: i,
		chunkStart: chunk.substring(0, 100),
		chunkEnd: chunk.substring(chunk.length - 100),
	},
	"Chunk boundary preview",
);
```

### Translation Content Inspection

To inspect translated content before commit:

```typescript
// Add to processFile() after translation
logger.debug(
	{
		filename: file.filename,
		translationPreview: metadata.translation.substring(0, 500),
		translationLength: metadata.translation.length,
	},
	"Translation content preview",
);
```

## Next Steps for Investigation

Based on the timing analysis, the recommended next steps are:

1. **Run with Debug Logging**: Execute the workflow with `LOG_LEVEL="debug"` for the problematic file
2. **Analyze Timing Sequence**: Verify all chunks complete before commit
3. **Validate Content**: Check that reassembled content matches expected length
4. **Compare with Successful Run**: Compare timing patterns with successful translations

## Related Files

- `src/services/translator.service.ts`: Translation and chunking logic
- `src/services/runner/base.service.ts`: Workflow orchestration
- `src/utils/logger.util.ts`: Logger configuration
