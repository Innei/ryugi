import { describe, expect, test } from 'vitest';

import {
  boxDrawingDiagrams,
  documentTitle,
  parseDocument,
  serializeDocument,
  stampBlockIds,
} from '../src/server/document-codec';

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
    expect(again.root.children.map((node) => node.type)).toEqual(
      state.root.children.map((node) => node.type),
    );
    expect(serializeDocument(again)).toContain('const a = 1 &lt; 2');
  });

  test('a chart keeps its spec and block id through a round trip', () => {
    const spec =
      '{"version":1,"type":"bar","x":"day","series":[{"key":"n"}],"data":[{"day":"10-09","n":14}]}';
    const state = parseDocument(`<doc><chart id="c1"><![CDATA[${spec}]]></chart></doc>`);
    expect(state.root.children[0]?.type).toBe('chart');
    const xml = serializeDocument(stampBlockIds(state));
    expect(xml).toContain('<chart id="c1">');
    expect(JSON.parse(xml.match(/<!\[CDATA\[(.*)\]\]>/s)![1]!)).toEqual(JSON.parse(spec));
  });

  test('reads details and footnotes and serializes them back', () => {
    const xml = `<doc>
      <details summary="Alternatives" open="true"><p>dropped</p></details>
      <p>Loro<footnote ref="1"/> merges.</p>
      <footnote-section><def ref="1">Loro docs.</def></footnote-section>
    </doc>`;
    const state = parseDocument(xml);
    expect(state.root.children.map((node) => node.type)).toEqual([
      'details',
      'paragraph',
      'footnote-section',
    ]);
    const out = serializeDocument(state);
    expect(out).toContain('summary="Alternatives"');
    expect(out).toContain('<footnote ref="1"');
    expect(out).toContain('<def ref="1">Loro docs.</def>');
  });

  test('steps keep their ids, titles and content through a round trip', () => {
    const state = parseDocument(
      `<doc><steps id="s"><step id="a" title="安装"><p>下载 <code>ryugi</code>。</p></step><step id="b" title="Run"><p>go</p></step></steps></doc>`,
    );
    expect(state.root.children[0]).toMatchObject({
      type: 'steps',
      steps: [
        { id: 'a', title: '安装' },
        { id: 'b', title: 'Run' },
      ],
    });
    const out = serializeDocument(state);
    expect(out).toContain('<step id="a" title="安装">');
    expect(out).toContain('<code>ryugi</code>');
    expect(parseDocument(out).root.children[0]).toMatchObject({
      type: 'steps',
      steps: [{ id: 'a' }, { id: 'b' }],
    });
  });

  test('rejects a grid: edits inside its cells do not reach doc.xml', () => {
    expect(() => parseDocument('<doc><grid><cell><p>A</p></cell></grid></doc>')).toThrow(
      '<grid> is not supported in documents',
    );
  });

  test('a dynamic block keeps its url, height and props', () => {
    const state = parseDocument(
      '<doc><dynamic id="d1" url="assets/tuner.html" initial-height="240"><![CDATA[{"radius":8}]]></dynamic></doc>',
    );
    expect(state.root.children[0]).toMatchObject({
      type: 'dynamic',
      url: 'assets/tuner.html',
      initialHeight: 240,
      props: { radius: 8 },
    });
    const out = serializeDocument(state);
    expect(out).toContain('url="assets/tuner.html"');
    expect(out).toContain('"radius":8');
  });

  test('a pending block keeps its intent and block id through a round trip', () => {
    const state = parseDocument(
      '<doc><h2 id="h1">存储</h2><pending id="p1" intent="讲清三类存储与 R2 key 前缀"/></doc>',
    );
    expect(state.root.children[1]).toMatchObject({
      type: 'pending',
      intent: '讲清三类存储与 R2 key 前缀',
    });
    const out = serializeDocument(state);
    expect(out).toContain('<pending id="p1" intent="讲清三类存储与 R2 key 前缀" />');
    expect(parseDocument(out).root.children[1]).toMatchObject({
      type: 'pending',
      intent: '讲清三类存储与 R2 key 前缀',
    });
  });

  test('rejects a pending block that is not a top-level block', () => {
    expect(() =>
      parseDocument('<doc><details summary="x"><pending intent="later"/></details></doc>'),
    ).toThrow('<pending> must be a top-level block');
    expect(() =>
      parseDocument('<doc><blockquote><pending intent="later"/></blockquote></doc>'),
    ).toThrow('<pending> must be a top-level block');
  });

  test.each([
    'https://example.com/x.html',
    'assets/../doc.xml',
    '/assets/x.html',
    'assets/x.js',
    'assets/sub/x.html',
    '',
  ])('rejects a dynamic url outside assets/<name>.html: %s', (url) => {
    expect(() => parseDocument(`<doc><dynamic url="${url}"></dynamic></doc>`)).toThrow(
      '<dynamic> url must be assets/<name>.html',
    );
  });

  test('rejects a dynamic url hidden behind a decoy in another attribute', () => {
    expect(() =>
      parseDocument(
        `<doc><dynamic x=" url='assets/a.html'" url="../../html/other/index.html"></dynamic></doc>`,
      ),
    ).toThrow('<dynamic> url must be assets/<name>.html');
  });

  test.each(['{bad json', '[1,2]', '"text"'])(
    'rejects dynamic props that are not a JSON object: %s',
    (props) => {
      expect(() =>
        parseDocument(`<doc><dynamic url="assets/a.html"><![CDATA[${props}]]></dynamic></doc>`),
      ).toThrow('<dynamic> props must be a JSON object');
    },
  );

  test('rejects a <def> outside <footnote-section>', () => {
    expect(() => parseDocument('<doc><p>a</p><def ref="1">x</def></doc>')).toThrow(
      '<def> belongs inside <footnote-section>',
    );
    expect(() =>
      parseDocument('<doc><footnote-section><def ref="1">x</def></footnote-section></doc>'),
    ).not.toThrow();
  });

  test('rejects a mismatched tag and names it', () => {
    expect(() => parseDocument('<doc><p>a</h2></doc>')).toThrow('</h2> closes <p>');
  });

  test('rejects a LiteXML tag documents do not support', () => {
    expect(() => parseDocument('<doc><poll><p>x</p></poll></doc>')).toThrow(
      '<poll> is not supported in documents',
    );
  });

  test('rejects a tag LiteXML does not know instead of dropping it', () => {
    expect(() => parseDocument('<doc><callout>x</callout></doc>')).toThrow(
      '<callout> is not a LiteXML tag',
    );
  });

  test('a paragraph with <strike> keeps the spaces between its inline tags', () => {
    expect(
      serializeDocument(parseDocument('<doc><p>a <strike>x</strike> <b>b</b> <i>c</i></p></doc>')),
    ).toContain('<p>a <s>x</s> <b>b</b> <i>c</i></p>');
  });

  test('ignores tag-like text inside CDATA', () => {
    expect(() =>
      parseDocument('<doc><codeblock><![CDATA[<poll></div>]]></codeblock></doc>'),
    ).not.toThrow();
  });
});

describe('stampBlockIds', () => {
  test('gives every top-level block a unique id and keeps existing ones', () => {
    const state = stampBlockIds(parseDocument('<doc><h2 id="keep">a</h2><p>b</p><p>c</p></doc>'));
    const ids = state.root.children.map(
      (node) => (node as { $?: { blockId?: string } }).$?.blockId,
    );
    expect(ids[0]).toBe('keep');
    expect(ids[1]).toMatch(/^[\w-]{8}$/);
    expect(new Set(ids).size).toBe(3);
    expect(serializeDocument(state)).toContain(`<p id="${ids[1]}">b</p>`);
  });

  test('replaces a duplicated id on the later block', () => {
    const state = stampBlockIds(parseDocument('<doc><p id="x">a</p><p id="x">b</p></doc>'));
    const ids = state.root.children.map(
      (node) => (node as { $?: { blockId?: string } }).$?.blockId,
    );
    expect(ids[0]).toBe('x');
    expect(ids[1]).not.toBe('x');
  });
});

test('the title is the text of the first heading', () => {
  expect(
    documentTitle(parseDocument('<doc><p>intro</p><h3>Relay <i>sync</i></h3><h1>later</h1></doc>')),
  ).toBe('Relay sync');
  expect(documentTitle(parseDocument('<doc><p>no heading</p></doc>'))).toBeNull();
});

describe('boxDrawingDiagrams', () => {
  const diagram =
    '┌──────────┐\n│ Cloud    │\n└────┬─────┘\n     ▼\n┌──────────┐\n│ Market   │\n└──────────┘';

  test('names code blocks drawn with box-drawing characters', () => {
    const state = parseDocument(
      `<doc><p>x</p><codeblock id="c1" lang="text"><![CDATA[${diagram}]]></codeblock></doc>`,
    );
    expect(boxDrawingDiagrams(state)).toEqual(['c1']);
  });

  test('names the top-level block that holds a nested diagram', () => {
    const state = parseDocument(
      `<doc><details id="d1" summary="Design"><codeblock lang="text"><![CDATA[${diagram}]]></codeblock></details></doc>`,
    );
    expect(boxDrawingDiagrams(state)).toEqual(['d1']);
  });

  test('leaves boxed program output alone', () => {
    const table =
      '┌─────────┬─────────┐\n│ Package │ Latest  │\n├─────────┼─────────┤\n│ vite    │ 8.3.5   │\n└─────────┴─────────┘';
    const notice =
      '╭──────────────────────────────╮\n│   Update available! 9 → 10   │\n│   Run pnpm add -g pnpm       │\n╰──────────────────────────────╯';
    const state = parseDocument(
      `<doc><codeblock id="t1"><![CDATA[${table}]]></codeblock><codeblock id="n1"><![CDATA[${notice}]]></codeblock></doc>`,
    );
    expect(boxDrawingDiagrams(state)).toEqual([]);
  });

  test('leaves code and a stray box character alone', () => {
    const tree = 'src/\n├─ a.ts\n└─ b.ts';
    const code = 'const a = 1;\n// │ not a diagram\nconst b = 2;';
    const state = parseDocument(
      `<doc><codeblock id="t1"><![CDATA[${tree}]]></codeblock><codeblock id="k1" lang="ts"><![CDATA[${code}]]></codeblock></doc>`,
    );
    expect(boxDrawingDiagrams(state)).toEqual([]);
  });
});
