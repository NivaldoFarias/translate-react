import { readFileSync } from 'fs';
import { parseTranslationChecklist, TranslationData } from '../data/translation-status';
import chalk from 'chalk';

function generateReport(data: TranslationData) {
  console.log(chalk.bold('\n📊 Translation Status Report\n'));

  const sections = [
    { name: 'Main Content', data: data.mainContent },
    { name: 'API Reference', data: data.apiReference },
    { name: 'Secondary Content', data: data.secondaryContent },
    { name: 'Optional Content', data: data.optionalContent }
  ];

  for (const section of sections) {
    console.log(chalk.blue.bold(`\n${section.name}:`));

    for (const subsection of section.data) {
      const pending = subsection.items.filter(item => item.status === 'PENDING');
      const inProgress = subsection.items.filter(item => item.status === 'IN_PROGRESS');

      console.log(chalk.yellow(`\n${subsection.name}:`));
      console.log(`Total items: ${subsection.items.length}`);
      console.log(`Pending: ${pending.length}`);
      console.log(`In Progress: ${inProgress.length}`);

      if (pending.length > 0) {
        console.log(chalk.red('\nPending Translations:'));
        pending.forEach(item => {
          console.log(`- ${item.title}`);
        });
      }

      if (inProgress.length > 0) {
        console.log(chalk.yellow('\nIn Progress:'));
        inProgress.forEach(item => {
          console.log(`- ${item.title} (by @${item.assignee}${item.prNumber ? ` - #${item.prNumber}` : ''})`);
        });
      }
    }
  }
}

// Read and parse the checklist
const checklistPath = '.translation-checklist.md';
const content = readFileSync(checklistPath, 'utf-8');
const data = parseTranslationChecklist(content);

// Generate and display the report
generateReport(data); 