import { z } from 'zod';

export const TranslationStatusSchema = z.object({
  title: z.string(),
  status: z.enum([ 'PENDING', 'IN_PROGRESS', 'COMPLETED' ]),
  assignee: z.string().optional(),
  prNumber: z.number().optional(),
  path: z.string().optional(),
});

export type TranslationStatus = z.infer<typeof TranslationStatusSchema>;

export interface TranslationSection {
  name: string;
  items: TranslationStatus[];
}

export interface TranslationData {
  mainContent: TranslationSection[];
  apiReference: TranslationSection[];
  secondaryContent: TranslationSection[];
  optionalContent: TranslationSection[];
}

function parseTranslationLine(line: string): TranslationStatus | null {
  // Skip empty lines or section headers
  if (!line.trim() || line.startsWith('#') || !line.includes(' ')) {
    return null;
  }

  // Extract information from the line
  const match = line.match(/^([📝\s]*)(.*?)(?:\s*\(@([^)]+)\))?\s*(?:#(\d+))?$/);
  if (!match) return null;

  const [ , , title, assignee, prNumberStr ] = match;
  const cleanTitle = title.trim();

  // Check if there's a mention in the title itself (e.g. "Something (@username)")
  const titleMentionMatch = cleanTitle.match(/\(@([^)]+)\)/);
  const titleMention = titleMentionMatch ? titleMentionMatch[ 1 ] : undefined;

  const finalAssignee = assignee || titleMention;

  return {
    title: cleanTitle.replace(/\s*\(@[^)]+\)/, '').trim(), // Remove mention from title if present
    status: finalAssignee ? 'IN_PROGRESS' : 'PENDING',
    ...(finalAssignee && { assignee: finalAssignee }),
    ...(prNumberStr && { prNumber: parseInt(prNumberStr, 10) })
  };
}

function extractSection(content: string, startMarker: string, endMarker?: string): TranslationStatus[] {
  const lines = content.split('\n');
  const items: TranslationStatus[] = [];

  let collecting = false;
  for (const line of lines) {
    if (line.includes(startMarker)) {
      collecting = true;
      continue;
    }
    if (endMarker && line.includes(endMarker)) {
      break;
    }
    if (collecting) {
      const item = parseTranslationLine(line);
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

// Parser function to extract translation status from the checklist
export function parseTranslationChecklist(content: string): TranslationData {
  return {
    mainContent: [ {
      name: "Main Content",
      items: extractSection(content, "Conteúdo principal", "Conteúdo Secundário")
    } ],
    apiReference: [ {
      name: "API Reference",
      items: extractSection(content, "API Reference", "Legacy React APIs")
    } ],
    secondaryContent: [ {
      name: "Secondary Content",
      items: extractSection(content, "Conteúdo Secundário", "Conteúdo opcional")
    } ],
    optionalContent: [ {
      name: "Optional Content",
      items: extractSection(content, "Conteúdo opcional")
    } ]
  };
} 