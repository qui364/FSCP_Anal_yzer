# Формат `.fscp` — структура

Описание структуры формата без данных конкретных установок.

## 1. Контейнер

ZIP (`PK\x03\x04`). Состав:

- Корневые XML (могут быть десятки МБ): `GKDeviceConfiguration.xml`, `PlansConfiguration.xml`, `LayoutsConfiguration.xml`, `SecurityConfiguration.xml`, `SystemConfiguration.xml`.
- `Content/<guid>` — картинки без расширения (PNG/JPEG), подложки планов: GUID в `Plan/BackgroundImageSource` (одну подложку могут использовать несколько планов). Других ссылок на `Content/` нет. Тип определять по сигнатуре.
- `Resources/<guid>.mp4` — видео. Описаны в `SystemConfiguration.xml` (`FileResource`: `Extension`, `FileType=Video`, `UID`), используются в `LayoutsConfiguration.xml` (`ReferenceUID` видеочасти раскладки).

Работа с архивом: XML огромные — читать частями (поиск, `Select-Xml`, потоковый разбор). Архив распаковывать в отдельную пустую папку, ничего из распакованного не запускать.

## 2. GKDeviceConfiguration.xml

`RootDevice` → дерево `GKDevice`, `Zones` (плоско, `GKZone`), `Delays` (плоско, `GKDelay`).

- Тег `GKDevice` есть и в `DeviceParameterTemplates/GKDeviceParameterTemplate` — это не устройства дерева, их исключать.
- У `GKDevice` нет имени, только `DriverUID`; `Description` — у части. Показ: `[полный адрес] PredefinedName || имя драйвера`, затем `Description`.
- Дети — `Children/GKDevice`. Параметры — `Properties` / `DeviceProperties` (одинаковые копии дублируются).
- Зоны: логические потомки — устройства, у которых зона в `ZoneUIDs`.
- Сценарии (`GKDelay`): исполнители — `DirectionDevices/DirectionDevice`; условия — `Logic/GKClause` с `DeviceUIDs` / `ZoneUIDs` / `DelayUIDs`. Есть также `Fire1Count`/`Fire2Count` и `ClauseOperationType`.
- Разделы, которые бывают пустыми: `Directions`, `PumpStations`, `MPTs`, `GuardZones`, `Doors`, `SKDZones`, `Codes`.
- Прочие разделы: `Cards` (`GKAdminCard`), `ParameterTemplates`, `OPCSettings`, `GuardZonesColorSettings`.

### Драйверы
`DriverUID` → справочник драйверов (`docs/DRIVERS.md`): `[имя, описание, иконка, без адреса, есть дети, категория]`. Встречаются неизвестные GUID.

### Параметры устройств
Эталоны — дефолты версии ПО (`docs/DEVICE-DEFAULTS.md`). Сопоставление по GUID драйвера и точному `Name` параметра. Это дефолты ПО, не гарантия заводских настроек. Подписи перечислимых значений — `docs/PARAM-ENUMS.md`.

### Зоны ДУ (дымоудаление)
Принятая схема именования сценариев: `Зона ДУ N` (корень; N бывает дробным) и `Зона ДУ N <Клапаны|ДП|ДВ|УДП|ПОЖАР>`; устройства — в `DirectionDevices`. Пожарные зоны ДУ — из условия (`Logic/ZoneUIDs`) сценария `… ПОЖАР`. Исполнители `ШУН-В`, `МДУ*` делятся на ДП|ДВ|ОЗК, `МВК` — на стробы|шторы (по `Description` устройства или имени сценария).

## 3. PlansConfiguration.xml

`Plans/Plan`, вложенные — `Children/Plan`.

- `PointObjects/PointObject`: `ItemUID` = устройство.
- `PolygonObjects/PolygonObject`: зона.
- `RectangleObjects/RectangleObject`: зона или сценарий.
- Поля: `Left/Top[/Width/Height]`, `Points`, `ZIndex`, `BorderColor/BackgroundColor` (ARGB), `ModuleData`.
- Все `ItemUID` указывают на существующие объекты.
- Порядок отрисовки: `ZLayer` (сценарии 11, зоны 60, устройства 70), затем `ZIndex`; точки сверху.
- Фигуры зон и устройства одной подложки могут лежать на разных одноимённых планах.
- Значки состояния «Норма» — из РЭ Global Monitor 2.8.7, прил. 6; живых состояний в формате нет.

## 4. Прочие XML

- `SecurityConfiguration.xml`: `Users` (`PasswordHash` — SHA-512), права — GUID в `Permissions`.
- `SystemConfiguration.xml`: `Sounds`, `JournalFilters` (`JournalEventNameTypes` = коды `Name` журнала), `FileResource`.
- `LayoutsConfiguration.xml`: раскладки, видеочасти ссылаются на `Resources/*.mp4`.

## 5. Журнал (CSV из ГК)

Не часть `.fscp`, но связан с ним.

- `ObjectType`: 1 — устройство, 2 — зона, 6 — сценарий; `ObjectUID` = UID объекта конфигурации.
- `UID` уникален (дубли при слиянии файлов отбрасывать).
- `SystemDate`/`DeviceDate` — FILETIME.
- `Name` (2002xxxx) — `GKJournalEvent`; `Description` — `GKJournalDescription`.
- `Detalisation` — формат `$%ключ%%значение%$`.
- Важность: красный — пожар/тревога, оранжевый — неисправность, жёлтый — внимание/тест, зелёный — норма.

## 6. Просмотрщик (`src/`)

Устройство просмотрщика (Vue 3 + JSZip, без бэкенда) и приёмы разбора — в `AGENTS.md`.
