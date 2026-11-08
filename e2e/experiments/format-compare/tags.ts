// Experiment-only: a JSX-like tag format for pfr-form and its converter to the JSON node tree.
// Attributes: name="text", bare name (= true), name={json} for numbers/arrays/booleans.
// Text/Heading/Badge/Alert take their text as the element content; Select/MultiSelect take
// <Option value="v">Label</Option>; Table takes <Col key="k">Label</Col> and <Row k="v" .../>.

export const TAG_SPEC = `You can render interactive forms, dashboards, parameter inputs, and approval cards by outputting a tag-based specification inside a fenced code block with the tag \`\`\`pfr-tags.

Use this format whenever you need to:
1. Collect input or configuration from the user (text, choices, toggles).
2. Ask for user confirmation or approval before running an action.
3. Present metrics, status progress, or structured data tables clearly.

### Format
XML/JSX-like tags nested as a component tree, starting with a root (usually <Card>). Attributes: name="text" for strings, a bare name for true, name={json} for numbers and arrays (e.g. min={0} defaultValue={["a","b"]}). Escape " as &quot; and < as &lt; inside attribute text.
Components (? = optional):
- <Card title? description?> children </Card>
- <Stack direction?="vertical|horizontal"> children </Stack>
- <Heading>text</Heading>
- <Text muted?>text</Text>
- <Divider/>
- <Metric label value/>
- <Badge tone?="neutral|info|success|warning|danger">text</Badge>
- <Alert title? tone?="neutral|info|success|warning|danger">text</Alert>
- <Progress label value={0-100}/>
- <Table> <Col key>Label</Col> ... <Row colKey="cell" .../> ... </Table>
- <Input id label placeholder? defaultValue? inputType?="text|number|integer|email|password|url" multiline? required? min?={n} max?={n} minLength?={n} maxLength?={n} pattern?/>
- <Select id label defaultValue? required?> <Option value>Label</Option> ... </Select>
- <MultiSelect id label placeholder? defaultValue?={[...]} required? min?={n} max?={n}> <Option value>Label</Option> ... </MultiSelect>
- <FilePicker id label placeholder? pickerType?="file|folder" extensions?={["mp4"]} defaultValue? required?/>
- <Toggle id label defaultValue?={true|false} required?/>
- <Button label variant?="primary|secondary|danger" action="submit|reset" message?/>

### Rules
1. Always give input fields (Input, Select, MultiSelect, FilePicker, Toggle) a unique id.
2. When the user clicks a Button with action="submit", the client sends the button's message along with all field values back to you.
3. Keep conversational text outside the code fence. The code block must contain only the tags.

### Example
\`\`\`pfr-tags
<Card title="Deployment Confirmation" description="Please review settings before releasing.">
  <Metric label="Target Environment" value="Production"/>
  <Input id="release_tag" label="Release Tag" placeholder="e.g., v1.0.4" required/>
  <Select id="strategy" label="Deploy Strategy" defaultValue="rolling">
    <Option value="rolling">Rolling Update</Option>
    <Option value="canary">Canary (10%)</Option>
  </Select>
  <Button label="Confirm & Deploy" variant="primary" action="submit" message="Start deployment with the selected parameters."/>
</Card>
\`\`\``;

const TEXT_TYPES = new Set(["Heading", "Text", "Badge", "Alert"]);

type El = { tag: string; attrs: Record<string, unknown>; children: (El | string)[] };

function unescapeAttr(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function parseTags(src: string): El {
  let i = 0;
  const fail = (msg: string): never => {
    throw new Error(`tag syntax error at offset ${i}: ${msg}`);
  };
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };

  function parseElement(): El {
    if (src[i] !== "<") fail("expected <");
    i++;
    const name = /^[A-Za-z][A-Za-z0-9]*/.exec(src.slice(i))?.[0] ?? fail("expected tag name");
    i += name.length;
    const attrs: Record<string, unknown> = {};
    for (;;) {
      ws();
      if (src.startsWith("/>", i)) {
        i += 2;
        return { tag: name, attrs, children: [] };
      }
      if (src[i] === ">") {
        i++;
        break;
      }
      const key = /^[A-Za-z_][\w-]*/.exec(src.slice(i))?.[0] ?? fail("expected attribute name");
      i += key.length;
      ws();
      if (src[i] !== "=") {
        attrs[key] = true;
        continue;
      }
      i++;
      ws();
      if (src[i] === '"') {
        const end = src.indexOf('"', i + 1);
        if (end === -1) fail("unterminated string");
        attrs[key] = unescapeAttr(src.slice(i + 1, end));
        i = end + 1;
      } else if (src[i] === "{") {
        let depth = 0;
        let j = i;
        let inStr = false;
        for (; j < src.length; j++) {
          const c = src[j];
          if (inStr) {
            if (c === "\\") j++;
            else if (c === '"') inStr = false;
          } else if (c === '"') inStr = true;
          else if (c === "{") depth++;
          else if (c === "}" && --depth === 0) break;
        }
        if (depth !== 0) fail("unterminated {...}");
        try {
          attrs[key] = JSON.parse(src.slice(i + 1, j));
        } catch {
          fail(`attribute ${key} is not valid JSON`);
        }
        i = j + 1;
      } else fail("attribute value must be \"text\" or {json}");
    }
    const children: (El | string)[] = [];
    for (;;) {
      if (i >= src.length) fail(`missing </${name}>`);
      if (src.startsWith("</", i)) {
        const close = /^<\/([A-Za-z][A-Za-z0-9]*)\s*>/.exec(src.slice(i));
        if (!close) fail("malformed closing tag");
        if (close![1] !== name) fail(`expected </${name}> but found </${close![1]}>`);
        i += close![0].length;
        return { tag: name, attrs, children };
      }
      if (src[i] === "<") children.push(parseElement());
      else {
        const next = src.indexOf("<", i);
        const end = next === -1 ? src.length : next;
        const text = unescapeAttr(src.slice(i, end));
        if (text.trim()) children.push(text.trim());
        i = end;
      }
    }
  }

  ws();
  const root = parseElement();
  ws();
  if (i < src.length) fail("unexpected content after the root element");
  return root;
}

export function tagsToNode(el: El): Record<string, unknown> {
  const node: Record<string, unknown> = { type: el.tag, ...el.attrs };
  const text = el.children.filter((c): c is string => typeof c === "string").join(" ");
  const kids = el.children.filter((c): c is El => typeof c !== "string");
  if (TEXT_TYPES.has(el.tag) && text) node.text = text;
  const options = kids.filter((k) => k.tag === "Option").map((k) => ({ value: k.attrs.value, label: k.children.filter((c) => typeof c === "string").join(" ") }));
  const cols = kids.filter((k) => k.tag === "Col").map((k) => ({ key: k.attrs.key, label: k.children.filter((c) => typeof c === "string").join(" ") }));
  const rows = kids.filter((k) => k.tag === "Row").map((k) => ({ ...k.attrs }));
  if (el.tag === "Select" || el.tag === "MultiSelect") node.options = options;
  if (el.tag === "Table") {
    node.columns = cols;
    node.rows = rows;
  }
  const rest = kids.filter((k) => !["Option", "Col", "Row"].includes(k.tag));
  if (rest.length || el.tag === "Card" || el.tag === "Stack") node.children = rest.map(tagsToNode);
  return node;
}

export function tagsToForm(src: string): Record<string, unknown> {
  return tagsToNode(parseTags(src.trim()));
}
