/**
 * 形象与人格面板:选形象、改它的人格文本、一次点击写回并重载系统前缀。
 *
 * 浏览器侧只允许 `import type` 框架,运行时依赖一律本地实现。
 */
import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

const PANEL = 'figure-persona';

interface FigureOption {
  id: string;
  name: string;
  persona: string;
  builtin: boolean;
  showing: boolean;
}

interface PanelState {
  options: FigureOption[];
  picked: string;
  field: string;
  persona: string;
}

interface ApplyResult {
  ok: boolean;
  figure: string;
  name: string;
  builtin: boolean;
  saved: boolean;
  message: string;
}

function labelOf(options: readonly FigureOption[], id: string): string {
  const hit = options.find((o) => o.id === id);
  if (!hit) return id === '' ? '(跟随宿主形象)' : id;
  return hit.name === '' ? hit.id : hit.name;
}

function mount(ctx: WebUiPanelContext): void {
  const { ui } = ctx;
  const card = ui.sheet({
    title: '形象与人格',
    en: 'figure & persona',
    desc: '选一个形象,改它说话的样子,点「确定并生效」。写入后会立刻重载系统前缀,下一句话就按新的人格说。',
  });
  card.el.classList.add('iocard');

  const status = ui.msgline('正在读形象列表…');
  const note = ui.msgline('');
  const editor = ui.textarea({
    rows: 10,
    placeholder: '这个形象说话的样子:语气、句子长短、口头禅、什么不说…',
  });

  let state: PanelState | null = null;
  let picked = '';

  const picker = ui.select({
    onChange: (value) => {
      if (!state) return;
      const hit = state.options.find((o) => o.id === value);
      if (!hit) return;
      picked = hit.id;
      editor.value = hit.persona;
      note.classList.remove('bad');
      note.textContent = hit.builtin
        ? '内置形象不带人格文本,选了它就用解释段里的缺省文案。'
        : '人格正文保存在 data/figures/' + hit.id + '/figure.json 的 persona 字段。';
    },
  });

  const applyBtn = ui.button('确定并生效', { variant: 'primary' });

  const bar = ui.rowbar();
  bar.append(applyBtn);

  card.body.append(
    status,
    ui.field('形象', picker),
    ui.field('人格文本', editor),
    note,
    bar,
  );
  ctx.root.appendChild(card.el);

  void ctx
    .invoke<PanelState>('state')
    .then((loaded) => {
      state = loaded;
      picked = loaded.picked;
      picker.textContent = '';
      for (const option of loaded.options) {
        const el = ui.h('option', null, option.builtin ? option.name + '(内置)' : option.name);
        el.value = option.id;
        if (option.id === loaded.picked) el.selected = true;
        picker.appendChild(el);
      }
      editor.value = loaded.persona;
      if (loaded.options.length === 0) {
        status.textContent = '一个形象包都没找到:data/figures 下面是空的。';
        status.classList.add('bad');
        return;
      }
      status.classList.remove('bad');
      status.textContent =
        '共 ' + loaded.options.length + ' 个形象,当前生效的是「' + labelOf(loaded.options, loaded.picked) + '」。';
    })
    .catch((error: unknown) => {
      status.textContent = '读不到形象列表:' + String((error as Error)?.message ?? error);
      status.classList.add('bad');
    });

  applyBtn.addEventListener('click', () => {
    if (picked === '') {
      status.textContent = '先选一个形象再点确定。';
      status.classList.add('bad');
      return;
    }
    const busy = ui.busy('写入并生效', '正在保存人格并重载系统前缀…');
    applyBtn.disabled = true;
    void ctx
      .invoke<ApplyResult>('apply', [{ figure: picked, persona: editor.value }])
      .then((result) => {
        status.textContent = result.message;
        status.classList.toggle('bad', !result.ok);
        ui.toast(result.ok ? '已生效' : '没有写成', result.ok ? 'ok' : 'bad');
        void ctx.refresh();
      })
      .catch((error: unknown) => {
        status.textContent = '写入失败:' + String((error as Error)?.message ?? error);
        status.classList.add('bad');
      })
      .finally(() => {
        busy.dispose();
        applyBtn.disabled = false;
      });
  });
}

const bundle = { panels: { [PANEL]: { mount } } };

export default bundle;
