import { expect, test } from 'vitest';
import { parseDocument } from '../src/server/document-codec';
import { historyDiff } from '../src/viewer/document/historyDiff';

test('rich inline changes keep table rows and code blocks', () => {
  const before = parseDocument('<doc><p>Hello old</p><table><tr><td>one</td></tr></table><codeblock lang="ts">const n = 1</codeblock></doc>');
  const after = parseDocument('<doc><p>Hello new</p><table><tr><td>two</td></tr><tr><td>added</td></tr></table><codeblock lang="ts">const n = 2</codeblock></doc>');
  const blocks = historyDiff(before, after);
  expect(blocks.filter((block) => block.kind !== 'equal')).toHaveLength(3);
  const output = JSON.stringify(blocks);
  expect(output).toContain('line-through');
  expect(output).toContain('old');
  expect(output).toContain('new');
  expect(output).toContain('table');
  const insertedText = (node: any): string => node.style?.includes('line-through') ? '' : (node.text ?? '') + (node.children ?? []).map(insertedText).join('');
  expect(blocks.map((block) => insertedText(block.value.root)).join('')).toContain('added');
  expect(output).toContain('code-block');
});

test.each([
  ['<p>same</p>', '<p><b>same</b></p>'],
  ['<p><a href="https://old.example">same</a></p>', '<p><a href="https://new.example">same</a></p>'],
  ['<codeblock lang="ts">same</codeblock>', '<codeblock lang="js">same</codeblock>'],
])('format and property changes cannot silently disappear: %s', (oldXml, newXml) => {
  const blocks = historyDiff(parseDocument(`<doc>${oldXml}</doc>`), parseDocument(`<doc>${newXml}</doc>`));
  const changed = blocks.filter((block) => block.kind !== 'equal');
  expect(changed).toHaveLength(1);
  expect(changed[0]!.before).toBeDefined();
  expect(changed[0]!.before).not.toEqual(changed[0]!.value);
});

test('internal block ids do not create visible changes', () => {
  const blocks = historyDiff(parseDocument('<doc><p id="before">same</p></doc>'), parseDocument('<doc><p id="after">same</p></doc>'));
  expect(blocks.length).toBeGreaterThan(0);
  expect(blocks.every((block) => block.kind === 'equal')).toBe(true);
});

test('historical dynamic HTML and pending blocks are inert descriptions', () => {
  const blocks = historyDiff(parseDocument('<doc><p>first</p></doc>'), parseDocument('<doc><dynamic url="assets/demo.html"><![CDATA[{"count":2}]]></dynamic><pending intent="Write the conclusion"/></doc>'));
  const output = JSON.stringify(blocks);
  expect(output).toContain('assets/demo.html');
  expect(output).toContain('count');
  expect(output).toContain('Write the conclusion');
  expect(output).not.toContain('"type":"dynamic"');
  expect(output).not.toContain('"type":"pending"');
});

test('a shifted link cannot hide its destination change behind newly inserted text', () => {
  const blocks = historyDiff(parseDocument('<doc><p><a href="https://old.example">same</a></p></doc>'), parseDocument('<doc><p>prefix <a href="https://new.example">same</a></p></doc>'));
  expect(blocks).toHaveLength(1);
  expect(JSON.stringify(blocks[0]!.before)).toContain('https://old.example');
  expect(JSON.stringify(blocks[0]!.value)).toContain('https://new.example');
});

test('height-only dynamic changes remain visible without executable nodes', () => {
  const blocks = historyDiff(parseDocument('<doc><dynamic url="assets/demo.html" initial-height="320"/></doc>'), parseDocument('<doc><dynamic url="assets/demo.html" initial-height="640"/></doc>'));
  expect(blocks).toHaveLength(1);
  expect(JSON.stringify(blocks[0]!.before)).toContain('320');
  expect(JSON.stringify(blocks[0]!.value)).toContain('640');
  expect(JSON.stringify(blocks)).not.toContain('"type":"dynamic"');
});

test('converting a paragraph to a heading is one change with old content first', () => {
  const blocks = historyDiff(parseDocument('<doc><p>same</p></doc>'), parseDocument('<doc><h2>same</h2></doc>'));
  expect(blocks.filter((block) => block.kind !== 'equal')).toHaveLength(1);
  expect(blocks[0]!.before!.root.children[0]!.type).toBe('paragraph');
  expect(blocks[0]!.value.root.children[0]!.type).toBe('heading');
});

test('each block points at its position in the versions it came from', () => {
  const blocks = historyDiff(parseDocument('<doc><p>kept</p><p>old</p><p>gone</p></doc>'), parseDocument('<doc><p>kept</p><p>new</p><p>added</p></doc>'));
  expect(blocks.map(({ kind, oldIndex, newIndex }) => ({ kind, oldIndex, newIndex }))).toEqual([
    { kind: 'equal', oldIndex: 0, newIndex: 0 },
    { kind: 'modify', oldIndex: 1, newIndex: 1 },
    { kind: 'modify', oldIndex: 2, newIndex: 2 },
  ]);
  const removed = historyDiff(parseDocument('<doc><p>a</p><p>b</p></doc>'), parseDocument('<doc><p>a</p></doc>'));
  expect(removed.at(-1)).toMatchObject({ kind: 'delete', oldIndex: 1 });
  expect(removed.at(-1)!.newIndex).toBeUndefined();
});
