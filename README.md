# Model_Electric

Спецификации разъёмов и пинов по чертежам жгутов. Каждый чертёж привязан к модели автомобиля.

## Реестр чертежей

| № чертежа | Марка | Модель | Листов | Спецификация | Статус |
|---|---|---|---|---|---|
| 1 | Lada | Niva Legend | 1 | [Wiring_1](specs/Wiring_1/Wiring_1_spec.md) | ✅ готово |
| 2 | Lada | Vesta NG | 5 | [Wiring_2](specs/Wiring_2/Wiring_2_spec.md) | ✅ готово |
| 3 | Lada | Iskra | 4 | [Wiring_3](specs/Wiring_3/Wiring_3_spec.md) | ✅ готово |
| 4 | Lada | Granta SD LB SW | 3 | [Wiring_4](specs/Wiring_4/Wiring_4_spec.md) | ✅ готово |
| 5 | Lada | Niva Travel (2020-2023 Classic) | 2 | [Wiring_5](specs/Wiring_5/Wiring_5_spec.md) | ✅ готово |
| 6 | Volkswagen | Polo V SD 2010-2020 (1) | 2 | [Wiring_6](specs/Wiring_6/Wiring_6_spec.md) | ✅ готово |
| 7 | Chevrolet | Niva | 2 | [Wiring_7](specs/Wiring_7/Wiring_7_spec.md) | ✅ готово |
| 8 | Lada | Granta Universal | 2 | [Wiring_8](specs/Wiring_8/Wiring_8_spec.md) | ✅ готово |
| 9 | Lada | Largus 2012-2021 | 2 | [Wiring_9](specs/Wiring_9/Wiring_9_spec.md) | ✅ готово |
| 10 | Lada | Largus 2021- | 4 | [Wiring_10](specs/Wiring_10/Wiring_10_spec.md) | ✅ готово |
| 11 | Lada | Legend 1993-2021 | 2 | [Wiring_11](specs/Wiring_11/Wiring_11_spec.md) | ✅ готово |
| 12 | Lada | Niva Travel 2021 Luxe | 5 | [Wiring_12](specs/Wiring_12/Wiring_12_spec.md) | ✅ готово |

Машиночитаемая версия реестра: [`drawings_registry.csv`](drawings_registry.csv).
Сводка по всем чертежам (потребность по моделям, каталог, вся распиновка, все замечания):
[`specs/Summary_all_drawings.xlsx`](specs/Summary_all_drawings.xlsx).

## Структура

`specs/Wiring_N/`:
- `Wiring_N[-k]_source.pdf` — исходные листы чертежа;
- `Wiring_N_spec.xlsx` — листы «Чертёж», «Разъёмы», «Распиновка», «BOM», «Замечания», «Каталог». В каждой строке есть «№ чертежа» и «Автомобиль»;
- `Wiring_N_spec.md` — то же в markdown.

`tools/data.py` — данные, считанные с чертежей, и каталог номеров. `tools/build_specs.py` — генератор:

```bash
python3 tools/build_specs.py
```
