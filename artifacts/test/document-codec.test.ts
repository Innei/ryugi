import { describe, expect, test } from 'vitest';
import { documentTitle, parseDocument, serializeDocument, stampBlockIds } from '../src/server/document-codec';

const sample = `<doc>
  <h2 id="h1">Relay <b>sync</b></h2>
  <p>Events carry a <code>seq</code>.</p>
  <ul><li>one</li></ul>
  <table><tr><th>a</th></tr><tr><td>b</td></tr></table>
  <codeblock lang="ts"><![CDATA[const a = 1 < 2]]></codeblock>
  <mermaid><![CDATA[graph TD; A-->B]]></mermaid>
  <alert type="note"><p>n</p></alert>
  <math display="block">x^2</math>
  <excalidraw>assets/flow.excalidraw</excalidraw>
  <img src="assets/a.png" alt="a"/>
</doc>`;

describe('parseDocument', () => {
  test('reads every node a document allows and serializes it back', () => {
    const state = parseDocument(sample);
    expect(state.root.children.map((node) => node.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'table',
      'code-block',
      'mermaid',
      'alert-quote',
      'katex-block',
      'excalidraw',
      'image',
    ]);
    const again = parseDocument(serializeDocument(state));
    expect(again.root.children.map((node) => node.type)).toEqual(state.root.children.map((node) => node.type));
    expect(serializeDocument(again)).toContain('const a = 1 &lt; 2');
  });

  test('a chart keeps its spec and block id through a round trip', () => {
    const spec = '{"version":1,"type":"bar","x":"day","series":[{"key":"n"}],"data":[{"day":"10-09","n":14}]}';
    const state = parseDocument(`<doc><chart id="c1"><![CDATA[${spec}]]></chart></doc>`);
    expect(state.root.children[0]?.type).toBe('chart');
    const xml = serializeDocument(stampBlockIds(state));
    expect(xml).toContain('<chart id="c1">');
    expect(JSON.parse(xml.match(/<!\[CDATA\[(.*)\]\]>/s)![1]!)).toEqual(JSON.parse(spec));
  });

  test('rejects a mismatched tag and names it', () => {
    expect(() => parseDocument('<doc><p>a</h2></doc>')).toThrow('</h2> closes <p>');
  });

  test('rejects a LiteXML tag documents do not support', () => {
    expect(() => parseDocument('<doc><poll><p>x</p></poll></doc>')).toThrow('<poll> is not supported in documents');
  });

  test('rejects a tag LiteXML does not know instead of dropping it', () => {
    expect(() => parseDocument('<doc><callout>x</callout></doc>')).toThrow('<callout> is not a LiteXML tag');
  });

  test('ignores tag-like text inside CDATA', () => {
    expect(() => parseDocument('<doc><codeblock><![CDATA[<poll></div>]]></codeblock></doc>')).not.toThrow();
  });
});

describe('stampBlockIds', () => {
  test('gives every top-level block a unique id and keeps existing ones', () => {
    const state = stampBlockIds(parseDocument('<doc><h2 id="keep">a</h2><p>b</p><p>c</p></doc>'));
    const ids = state.root.children.map((node) => (node as { $?: { blockId?: string } }).$?.blockId);
    expect(ids[0]).toBe('keep');
    expect(ids[1]).toMatch(/^[\w-]{8}$/);
    expect(new Set(ids).size).toBe(3);
    expect(serializeDocument(state)).toContain(`<p id="${ids[1]}">b</p>`);
  });

  test('replaces a duplicated id on the later block', () => {
    const state = stampBlockIds(parseDocument('<doc><p id="x">a</p><p id="x">b</p></doc>'));
    const ids = state.root.children.map((node) => (node as { $?: { blockId?: string } }).$?.blockId);
    expect(ids[0]).toBe('x');
    expect(ids[1]).not.toBe('x');
  });
});

test('the title is the text of the first heading', () => {
  expect(documentTitle(parseDocument('<doc><p>intro</p><h3>Relay <i>sync</i></h3><h1>later</h1></doc>'))).toBe('Relay sync');
  expect(documentTitle(parseDocument('<doc><p>no heading</p></doc>'))).toBeNull();
});
