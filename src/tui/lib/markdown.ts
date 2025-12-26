import { Marked, type Tokens } from "marked";
import chalk from "chalk";

// Ensure colors are enabled for TUI rendering
chalk.level = 3;

const marked = new Marked({ async: false });

marked.use({
  renderer: {
    code({ text }: Tokens.Code): string {
      return chalk.yellow(text) + "\n";
    },

    blockquote(this: any, { tokens }: Tokens.Blockquote): string {
      const text = this.parser.parse(tokens);
      return chalk.gray("│ ") + text.trim().split("\n").join("\n│ ") + "\n";
    },

    heading(this: any, { tokens, depth }: Tokens.Heading): string {
      const text = this.parser.parseInline(tokens);
      const prefix = "#".repeat(depth) + " ";
      return chalk.bold.green(prefix + text) + "\n\n";
    },

    hr(): string {
      return chalk.dim("─".repeat(40)) + "\n";
    },

    list(this: any, { items, ordered }: Tokens.List): string {
      return (
        items
          .map((item, i) => {
            const bullet = ordered ? `${i + 1}.` : "•";
            const text = this.parser.parse(item.tokens).trim();
            return `${bullet} ${text}`;
          })
          .join("\n") + "\n"
      );
    },

    paragraph(this: any, { tokens }: Tokens.Paragraph): string {
      return this.parser.parseInline(tokens) + "\n\n";
    },

    strong(this: any, { tokens }: Tokens.Strong): string {
      const text = this.parser.parseInline(tokens);
      return chalk.bold(text);
    },

    em(this: any, { tokens }: Tokens.Em): string {
      const text = this.parser.parseInline(tokens);
      return chalk.italic(text);
    },

    codespan({ text }: Tokens.Codespan): string {
      return chalk.yellow("`" + text + "`");
    },

    del(this: any, { tokens }: Tokens.Del): string {
      const text = this.parser.parseInline(tokens);
      return chalk.strikethrough(text);
    },

    link(this: any, { href, tokens }: Tokens.Link): string {
      const text = this.parser.parseInline(tokens);
      return chalk.cyan.underline(text) + chalk.dim(` (${href})`);
    },

    image(): string {
      return "[image]";
    },

    text(this, token: Tokens.Text | Tokens.Escape): string {
      if ("tokens" in token && token.tokens) {
        return this.parser.parseInline(token.tokens);
      }
      return token.text;
    },

    html(token: Tokens.HTML | Tokens.Tag): string {
      return chalk.dim(token.text);
    },

    br(): string {
      return "\n";
    },
  },
});

export function renderMarkdown(text: string): string {
  const result = marked.parse(text) as string;
  return result.trimEnd();
}
