/**
 * 形象与人格面板:一个形象挂几档人设,一键切换。
 *
 * 浏览器侧只允许 `import type` 框架,运行时依赖一律本地实现。
 */
import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

const PANEL = 'figure-persona';
const FALLBACK_PROFILE = '默认';

interface ProfileView {
  name: string;
  persona: string;
  active: boolean;
}

interface FigureOption {
  id: string;
  name: string;
  persona: string;
  profiles: ProfileView[];
  builtin: boolean;
  showing: boolean;
}

interface PanelState {
  options: FigureOption[];
  picked: string;
  field: string;
  persona: string;
  profile: string;
  source: 'store' | 'pack' | 'none';
  store: string;
}

interface ApplyResult {
  ok: boolean;
  figure: string;
  name: string;
  builtin: boolean;
  saved: boolean;
  profile: string;
  message: string;
}

const labelOf = (options: readonly FigureOption[], id: string): string => {
  const hit = options.find((o) => o.id === id);
  if (!hit) return id === '' ? '(跟随宿主形象)' : id;
  return hit.name === '' ? hit.id : hit.name;
};

const errText = (error: unknown): string => String((error as Error)?.message ?? error);

function mount(ctx: WebUiPanelContext): void {
  const { ui } = ctx;

  const card = ui.sheet({
    title: '形象与人格',
    en: 'figure & persona',
    desc: '一个形象可以挂几档人设(日常版、工作版…),一键切换。档位存在形象包之外,形象包更新不会把它们冲掉。',
  });
  card.el.classList.add('iocard');

  const status = ui.msgline('正在读形象列表…');
  const note = ui.msgline('');
  const storeLine = ui.msgline('');

  let state: PanelState | null = null;
  let picked = '';
  let selected = FALLBACK_PROFILE;
  let profiles: ProfileView[] = [];

  const findOption = (id: string): FigureOption | undefined => state?.options.find((o) => o.id === id);

  const editor = ui.textarea({
    rows: 10,
    placeholder: '这一档说话的样子:语气、句子长短、口头禅、什么不说…',
  });

  const profilePicker = ui.select({
    onChange: (value) => {
      selected = value;
      const hit = profiles.find((p) => p.name === value);
      editor.value = hit ? hit.persona : '';
      note.classList.remove('bad');
      note.textContent = hit && hit.active
        ? '这是当前生效的档。'
        : '改完点「保存并生效」,这一档才会写进去并切过去。';
    },
  });

  const figurePicker = ui.select({
    onChange: (value) => {
      const option = findOption(value);
      if (!option) return;
      picked = option.id;
      profiles = option.profiles.map((p) => ({ ...p }));
      selected = option.profiles.find((p) => p.active)?.name ?? option.profiles[0]?.name ?? FALLBACK_PROFILE;
      paintProfiles();
      editor.value = option.persona;
      note.classList.remove('bad');
      note.textContent = option.builtin
        ? '内置形象不带人格文本,选了它就用解释段里的缺省文案。'
        : option.profiles.length === 0
          ? '这个形象还没有人设档:写点东西,点「保存并生效」就会建出「' + selected + '」档。'
          : '共 ' + option.profiles.length + ' 档,当前生效的是「' + selected + '」。';
    },
  });

  const newName = ui.input({ placeholder: '新档名,如 工作版' });
  const addBtn = ui.button('新建档', { size: 'sm' });
  const delBtn = ui.button('删除此档', { size: 'sm', variant: 'plain' });
  const saveBtn = ui.button('保存并生效', { variant: 'primary' });
  const switchBtn = ui.button('切到这一档', { size: 'md' });

  const profileRow = ui.rowbar();
  profileRow.append(newName, addBtn, delBtn);

  const bar = ui.rowbar();
  bar.append(saveBtn, switchBtn);

  card.body.append(
    status,
    ui.field('形象', figurePicker),
    ui.field('人设档', profilePicker),
    profileRow,
    ui.field('人格文本', editor),
    note,
    bar,
    storeLine,
  );
  ctx.root.appendChild(card.el);

  function paintProfiles(): void {
    profilePicker.textContent = '';
    const names = profiles.length === 0 ? [FALLBACK_PROFILE] : profiles.map((p) => p.name);
    for (const name of names) {
      const hit = profiles.find((p) => p.name === name);
      const el = ui.h('option', null, hit && hit.active ? name + '(生效中)' : name);
      el.value = name;
      if (name === selected) el.selected = true;
      profilePicker.appendChild(el);
    }
  }

  function paintFigures(): void {
    if (!state) return;
    figurePicker.textContent = '';
    for (const option of state.options) {
      const el = ui.h('option', null, option.builtin ? option.name + '(内置)' : option.name);
      el.value = option.id;
      if (option.id === picked) el.selected = true;
      figurePicker.appendChild(el);
    }
  }

  function applyState(loaded: PanelState, keepFigure: string, keepProfile: string): void {
    state = loaded;
    const target = keepFigure !== '' && loaded.options.some((o) => o.id === keepFigure) ? keepFigure : loaded.picked;
    const option = findOption(target) ?? loaded.options[0];
    picked = option ? option.id : '';
    profiles = option ? option.profiles.map((p) => ({ ...p })) : [];
    const wanted = keepProfile !== '' ? keepProfile : option?.profiles.find((p) => p.active)?.name ?? '';
    selected = profiles.some((p) => p.name === wanted) ? wanted : profiles[0]?.name ?? FALLBACK_PROFILE;
    paintFigures();
    paintProfiles();
    editor.value = option ? option.persona : '';
    storeLine.textContent = '档位存储:' + loaded.store;
    if (loaded.options.length === 0) {
      status.textContent = '一个形象包都没找到:data/figures 下面是空的。';
      status.classList.add('bad');
      return;
    }
    status.classList.remove('bad');
    status.textContent =
      '共 ' + loaded.options.length + ' 个形象,当前生效的是「' + labelOf(loaded.options, picked) + '」的「' + selected + '」档。';
  }

  const reload = (keepFigure = '', keepProfile = ''): Promise<void> =>
    ctx
      .invoke<PanelState>('state')
      .then((loaded) => applyState(loaded, keepFigure, keepProfile))
      .catch((error: unknown) => {
        status.textContent = '读不到形象列表:' + errText(error);
        status.classList.add('bad');
      });

  void reload();

  addBtn.addEventListener('click', () => {
    const name = newName.value.replace(/\s+/g, ' ').trim();
    if (name === '') {
      status.textContent = '先写一个档名再点新建。';
      status.classList.add('bad');
      return;
    }
    if (profiles.some((p) => p.name === name)) {
      status.textContent = '已经有「' + name + '」这一档了,直接选它改就行。';
      status.classList.add('bad');
      return;
    }
    profiles.push({ name, persona: '', active: false });
    selected = name;
    paintProfiles();
    editor.value = '';
    newName.value = '';
    note.classList.remove('bad');
    note.textContent = '新档「' + name + '」还没保存:写完正文,点「保存并生效」。';
  });

  delBtn.addEventListener('click', () => {
    if (picked === '') return;
    const busyConfirm = ui.confirm({
      title: '删掉「' + selected + '」这一档?',
      body: '删掉之后这段字就没有了;形象包本身不受影响。',
      danger: true,
    });
    void busyConfirm.then((agreed) => {
      if (!agreed) return;
      const busy = ui.busy('删除档位', '正在删…');
      return ctx
        .invoke<{ ok: boolean; message: string }>('remove', [{ figure: picked, profile: selected }])
        .then((result) => {
          status.textContent = result.message;
          status.classList.remove('bad');
          ui.toast('已删掉', 'ok');
          return reload(picked, '');
        })
        .catch((error: unknown) => {
          status.textContent = '删档失败:' + errText(error);
          status.classList.add('bad');
        })
        .finally(() => busy.dispose());
    });
  });

  saveBtn.addEventListener('click', () => {
    if (picked === '') {
      status.textContent = '先选一个形象再点保存。';
      status.classList.add('bad');
      return;
    }
    const busy = ui.busy('写入并生效', '正在保存这一档并重载系统前缀…');
    const off = ui.disable(saveBtn, switchBtn, addBtn, delBtn, figurePicker, profilePicker);
    void ctx
      .invoke<ApplyResult>('apply', [{ figure: picked, profile: selected, persona: editor.value }])
      .then((result) => {
        status.textContent = result.message;
        status.classList.toggle('bad', !result.ok);
        ui.toast(result.ok ? '已生效' : '没有写成', result.ok ? 'ok' : 'bad');
        void ctx.refresh();
        return reload(result.figure, result.profile);
      })
      .catch((error: unknown) => {
        status.textContent = '写入失败:' + errText(error);
        status.classList.add('bad');
      })
      .finally(() => {
        off.dispose();
        busy.dispose();
      });
  });

  switchBtn.addEventListener('click', () => {
    if (picked === '') {
      status.textContent = '先选一个形象。';
      status.classList.add('bad');
      return;
    }
    const busy = ui.busy('切换档位', '正在切到这一档…');
    const off = ui.disable(saveBtn, switchBtn, addBtn, delBtn);
    void ctx
      .invoke<ApplyResult>('switch', [{ figure: picked, profile: selected }])
      .then((result) => {
        status.textContent = result.message;
        status.classList.toggle('bad', !result.ok);
        ui.toast('已切换', 'ok');
        void ctx.refresh();
        return reload(result.figure, result.profile);
      })
      .catch((error: unknown) => {
        status.textContent = '切换失败:' + errText(error);
        status.classList.add('bad');
      })
      .finally(() => {
        off.dispose();
        busy.dispose();
      });
  });
}

const bundle = { panels: { [PANEL]: { mount } } };

export default bundle;
