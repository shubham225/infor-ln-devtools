import * as fs from "fs";
import * as path from "path";

export type HhcNode = {
  name: string;
  local?: string;
  children?: HhcNode[];
};

export type IndexEntry = {
  name: string;
  local?: string;
};

function parseParam(tag: string) {
  const m = tag.match(/name\s*=\s*"([^"]+)"\s+value\s*=\s*"([^"]+)"/i);
  if (m) { return { name: m[1], value: m[2] }; }
  return null;
}

export function parseHhc(content: string): HhcNode[] {
  // Tokenize into tags we'll care about
  const re = /<li>|<\/li>|<ul>|<\/ul>|<param[^>]*>/gi;
  const tokens = Array.from(content.matchAll(re)).map((m) => ({
    text: m[0],
    index: m.index || 0,
  }));

  const root: HhcNode[] = [];
  const stack: { children: HhcNode[] }[] = [{ children: root }];
  let currentNode: HhcNode | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].text;
    if (t.toLowerCase() === "<li>") {
      currentNode = { name: "", children: [] };
    } else if (t.toLowerCase() === "</li>") {
      if (currentNode) {
        // push into parent
        const parent = stack[stack.length - 1];
        parent.children.push(currentNode);
      }
      currentNode = null;
    } else if (t.toLowerCase() === "<ul>") {
      // dive: the last pushed node becomes parent for next items
      if (stack.length > 0 && stack[stack.length - 1].children.length > 0) {
        const last = stack[stack.length - 1].children[
          stack[stack.length - 1].children.length - 1
        ];
          if (!last.children) { last.children = []; }
        stack.push({ children: last.children });
      } else {
        // push empty container
        stack.push({ children: [] });
      }
    } else if (t.toLowerCase() === "</ul>") {
      stack.pop();
    } else if (/^<param/i.test(t)) {
      const param = parseParam(t);
      if (param && currentNode) {
        if (param.name.toLowerCase() === "name") { currentNode.name = param.value; }
        else if (param.name.toLowerCase() === "local") { currentNode.local = param.value; }
      }
    }
  }

  return root;
}

export function parseHhk(content: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  // Find sequences of Name and Local within small windows
  const nameRe = /<param\s+name\s*=\s*"Name"\s+value\s*=\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(content))) {
    const name = m[1];
    // search for Local shortly after
    const tail = content.slice(m.index, m.index + 300);
    const localMatch = /<param\s+name\s*=\s*"Local"\s+value\s*=\s*"([^"]+)"/i.exec(tail);
    entries.push({ name, local: localMatch ? localMatch[1] : undefined });
  }
  return entries;
}

export function loadProgrammerGuideFromDir(rootDir: string) {
  // Expect files backendtoc.hhc and progguide_index.hhk at rootDir
  const hhcPath = path.join(rootDir, "backendtoc.hhc");
  const hhkPath = path.join(rootDir, "progguide_index.hhk");
  const progguideDir = path.join(rootDir, "progguide");

  const result: {
    contents: HhcNode[];
    index: IndexEntry[];
    baseDir: string;
  } = { contents: [], index: [], baseDir: rootDir };

  try {
    if (fs.existsSync(hhcPath)) {
      const hhc = fs.readFileSync(hhcPath, { encoding: "utf8" });
      result.contents = parseHhc(hhc);
    }
  } catch (e) {
    // ignore
  }

  try {
    if (fs.existsSync(hhkPath)) {
      const hhk = fs.readFileSync(hhkPath, { encoding: "utf8" });
      result.index = parseHhk(hhk);
    }
  } catch (e) {
    // ignore
  }

  return result;
}
