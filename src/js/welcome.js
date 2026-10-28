// Главная страница: заголовок и рамка для файла (показывается, пока ничего не загружено)
const WelcomeView = {
  setup() {
    const over = ref(false), picker = ref(null);
    // .csv — журнал событий, остальное — архив конфигурации
    const take = fs => {
      fs = [...fs];
      const csv = fs.filter(f => /\.csv$/i.test(f.name)), rest = fs.filter(f => !/\.csv$/i.test(f.name));
      if (rest[0]) load(rest[0]);
      if (rest.length > 1) ask({ title: 'Открыт только первый архив', text: rest[0].name, items: rest.slice(1).map(f => f.name), note: 'Остальные пропущены: одновременно открывается один архив.', ok: 'ОК', cancel: '' });
      if (csv.length) { readLogs(csv); if (!rest[0]) openLogInfo(); }
    };
    const onPick = () => { take(picker.value.files); picker.value.value = ''; };
    const onDrop = ev => { over.value = false; take(ev.dataTransfer.files); };
    return { over, picker, onPick, onDrop, acc };
  },
  template: `
<div id="welcome">
  <h1 id="appname">FSCP Analyzer</h1>
  <div id="drop" :class="{ over }" @click="picker.click()" @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="onDrop">
    Перетащите .fscp или .csv файл сюда<br>или нажмите для выбора<input ref="picker" type="file" :accept="acc('.fscp,.zip,.csv')" multiple hidden @change="onPick">
  </div>
</div>`,
};
