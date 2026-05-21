# Image Recovery Tick — 20260521T160351Z

## Job

- **id**: d41a370c-6fa1-4ffe-a8b9-a8462f70f15a
- **label**: POI-7 top-101 oldest · guardrail ON
- **mode**: missing · **force**: false · **dry_run**: false
- **scope**: 101 location IDs (POI-7 oldest, no previous recovery attempt)
- **page_size**: 25 · **max_total**: 101 · **waves**: 5

## Resumen

| Métrica | Valor |
|---|---|
| accepted (POI-7 → POI-8) | **88** |
| rejected (stays POI-7, logged en media_rejected[]) | **6** |
| pending_review (NO cuenta para POI-8) | **0** |
| failed (transient) | **0** |
| none (sin candidato definitivo) | **7** |
| total procesados | 101 |
| POI-7 restante global (post-tick) | **1615** (antes: 1703) |

## Guardrail

- accepted → `enriched_data.imagen` + `image_status='accepted'` (representative) → cuenta POI-8.
- rejected → empuja a `media_rejected[]`, NO escribe `imagen` → sigue POI-7.
- pending_review → persiste `imagen` con `image_status='pending_review'` → NO cuenta POI-8. (0 casos en este tick)
- none → `media.image_recovery_attempted_at` marcado, sin escritura sobre datos.

## Invariantes verificados

Sin mutaciones a: `name`, `latitude`, `longitude`, FKs geo, `enriched_data.descripcion`, tags, colecciones.
Sin re-enrich (función `recover-missing-images` solo invoca image search + quality gate).

## Accepted (88)

| id | name | source |
|---|---|---|
| ea68e884-7369-4ba0-aa81-51e5533b9f88 | Anghiari | wikipedia: es:Anghiari |
| 795fef90-2cdc-4df1-bd39-ca647229169f | Apricale | wikipedia: es:Apricale |
| be4add00-cdd3-4774-8dc5-d8ce4a468331 | Atzara | wikipedia: es:Atzara |
| c972315e-ccfa-4915-aefb-3c398f22a880 | Awhum Waterfall and Cave | wikimedia_geosearch: Arhurum Waterfall.jpg |
| 221b5281-0ee7-4e33-be40-527ebdec1887 | Bač Fortress | wikipedia: en:Bač Fortress |
| d7f709d3-7644-4283-85bf-0146236264e8 | Bagnara di Romagna | wikipedia: es:Bagnara di Romagna |
| ecfa28f5-86b6-4b6f-9369-887139f0e841 | Bagno di Romagna | wikipedia: es:Bagno di Romagna |
| e7e7dfd0-64b0-422a-8c74-d1f3e49561f9 | Bandiagara Escarpment Cliff Dwellings | wikimedia_geosearch: The National Archives UK - CO 1069-17-16.jpg |
| 71916998-99a7-4d4a-85f3-f3070c8879a5 | Bluetooth Runestone | wikimedia_geosearch: ST Ericsson Lund 20120919 0045F (8265151846).jpg |
| 732a9487-a06c-4205-893a-740297a2d931 | Bobbio | wikipedia: es:Bobbio |
| b884ffc5-fd41-4ccd-aad3-3383ce548a36 | Borgo Valsugana | wikipedia: es:Borgo Valsugana |
| 7a2fdbe9-5ecd-470d-bde6-c8c98637bf30 | Boville Ernica | wikipedia: es:Boville Ernica |
| c2cc8173-2c4a-4964-8e65-cc0f74cf88da | Bozcaada | wikimedia_commons: Bozcaada Ilford sfx 200 00068.jpg |
| 96e33434-6fda-48e0-b4de-df0888659d9c | Breslavia | wikipedia: es:Breslavia |
| 5141e014-a2e5-4b66-957d-310df67802b0 | Caldes | wikipedia: es:Caldes |
| 8ee51ed7-e781-4e8a-a3f5-0c1aef714cc0 | Castelponzone | wikimedia_commons: Monumento ai caduti di Castelponzone.jpg |
| a927a780-27e9-457f-a3d6-844c14e0f0ee | Castelrotto / Kastelruth | wikimedia_commons: Schlern aus Tisens Kastelruth.jpg |
| e0f017ed-ac7f-48d4-a56c-3497db1b8cf5 | Castelvetro di Modena | wikipedia: en:Castelvetro di Modena |
| 87ca871c-3386-4329-9060-88e2224cd4ea | Castiglione del Lago | wikipedia: es:Castiglione del Lago |
| 5f04356d-fcb6-4813-8f17-3c61cf37e3ca | Castillo de Malbork | wikipedia: es:Castillo de Malbork |
| 6e419af4-9ace-4d9b-9d30-dafa2e4de677 | Castle View Guesthouse | wikimedia_geosearch: Trakai - panoramio.jpg |
| b62f7b15-00c0-4cbd-9bb0-e7abb7b62b55 | Cividale del Friuli | wikipedia: es:Cividale del Friuli |
| bdf3dcaa-a039-4db9-a06f-84b8879a432c | Colletta | wikimedia_commons: A Culetta de Castergiancu.jpg |
| 71c3829d-173b-45d3-a683-9bbd6b7c29cb | Corenno Plinio | wikimedia_commons: Dervio - castello di Corenno Plinio - agosto 2022.jpeg |
| 64f031f9-f133-4b0e-9867-d7f1d66d7959 | Cornello dei Tasso | wikimedia_commons: Portici di Cornello - Museo dei Tasso e della Storia Postale.jpg |
| 554c2784-5eb6-4a73-954f-7515c1bf0922 | Deiva Marina | wikipedia: es:Deiva Marina |
| 1edc0a7a-c3eb-43d7-ac0c-7ba381bcfc94 | Demre | wikipedia: es:Demre |
| 54385784-4fc3-4808-9ca4-8354a523b558 | Derinkuyu | wikipedia: es:Derinkuyu |
| 705307ff-44aa-49a9-a741-017b3b4269f1 | Diano Castello | wikipedia: es:Diano Castello |
| 9edb4e3a-62ba-489b-a6ec-c5bacca1e606 | Distrito de los lagos de Masuria | wikipedia: es:Distrito de los lagos de Masuria |
| 8a1340a3-570b-4803-9ec7-9cb455909077 | Djingareyber Mosque | wikimedia_commons: Djinguereber Mosque.jpg |
| 380e57f1-2717-4f35-abb5-201115e6b260 | Dolmen de Bagneux | wikipedia: en:Dolmen de Bagneux |
| d20de930-fe09-42d5-a401-0cafbe11bdad | Éfeso | wikipedia: es:Éfeso |
| 4094f50f-df96-428e-a008-d40ace8fa37d | Esie Figurines | wikidata: Esiẹ Museum |
| 298bcc04-ae7c-4613-a488-5b31588d358b | Etroubles | wikipedia: es:Etroubles |
| aad8a7b2-e079-453c-946f-7bfc2df24150 | Fethiye | wikipedia: es:Fethiye |
| 5a20a2e1-897c-4f3d-8e84-296086c74a9a | Finalborgo | wikimedia_commons: Bassorilievo a Finalborgo.jpg |
| 990c1954-ae74-47d4-8903-ddd6f4fd2515 | Fontainemore | wikipedia: es:Fontainemore |
| 49b3ac3d-44e6-428b-9ab8-a0924865ea91 | Garbagna | wikipedia: es:Garbagna |
| c0630edd-763b-4191-a92e-765fc026e190 | Gidan Rumfa (Emir's Palace) | wikimedia_geosearch: Ancient door in National Museum Kano 04.jpg |
| 3b6d72ed-86c0-4d81-91d1-ae051a8791a5 | Grand Mosque of Mopti | wikipedia: en:Grand Mosque of Mopti |
| 23240620-8769-4810-92e9-4ebffbea19c3 | Great Mud Mosque of Djenné | wikimedia_geosearch: La grande mosquée-1, Djenné, Mali au petit matin. Date du cliché 27-12-1972.jpg |
| 968d28eb-fc03-4d70-8bb1-410b6ee24142 | Griffith & Feil Soda Fountain | wikimedia_geosearch: KenovaWV PumpkinHouse.jpg |
| 75f4a275-0b1f-4297-8b1e-a497520f2708 | Gualtieri | wikipedia: es:Gualtieri |
| e8c69d4e-bc97-4229-a72f-e5b6c5796361 | Hagia Sophia Museum | wikimedia_commons: Blue Mosque From Aya Sofya 2009.jpg |
| 4c1c5fc2-2c13-4096-aa77-40e30a4596df | Halfeti | wikipedia: en:Halfeti |
| 192938bc-e866-4cee-b80a-cf8398a92e14 | Hierapolis | wikipedia: en:Hierapolis |
| c19fd750-fd22-43b1-97ce-c107e3715c63 | Iyake Suspended Lake | wikimedia_commons: Iyake Suspended lake - Ado Awaye, Iseyin, Oyo State, Nigeria. 01.jpg |
| 42cb76c4-0339-426d-890a-9b26f02a1cb4 | Kaş | wikipedia: en:Kaş |
| 65031bbe-dbf4-4e81-941d-211819b6b989 | Kennecott Mines | wikimedia_commons: Kennecott Mines.jpg |
| 1a3fbd5b-a365-424e-852e-6c015196e8a3 | Kuşadası | wikipedia: es:Kuşadası |
| c1d21d45-10b4-4ec6-97ed-ce799b042152 | Lekki Conservation Center | wikimedia_commons: LEKKI CONSERVATION CENTRE LAGOS, NIGERIA (LCC) 13.jpg |
| 936f1b10-e61d-41c9-ba9e-242df1f2aa12 | Monasterio de Studenitsa | wikimedia_geosearch: Studenica - panoramio.jpg |
| b41a33d7-10e7-45c0-9cc9-f95fbd775d13 | Monasterio de Sumela | wikipedia: es:Monasterio de Sumela |
| 5021709b-2e96-4fd8-8536-dba096048d6f | Montechiarugolo | wikipedia: es:Montechiarugolo |
| 3bff9788-daee-490a-b98a-11b66cdffddd | Moresco | wikipedia: es:Moresco |
| 9272e4ba-3094-4b43-8f22-9b52bb502675 | Morro D'Alba | wikimedia_commons: Morro d'Alba - Comune di Morro d'Alba - 2023-09-14 14-36-05 001.JPG |
| fea4be0a-ad9e-4239-ae85-693a79fcf77f | Norwegian Church Arts Centre | wikimedia_commons: The Norwegian Church - geograph.org.uk - 984537.jpg |
| fb30dca1-8692-4a59-8f09-740c49f214ce | Offida | wikipedia: es:Offida |
| 46ddc393-7b3c-44b1-8cc1-e333570ffbc3 | Ogbunike Caves | wikimedia_commons: Ogbunike cave, Ogbunike.jpg |
| 85929afe-5c53-4a62-8893-7f944d1d31a7 | Opi | wikipedia: es:Opi |
| 3b521e2b-5e41-453f-a660-d037583a6560 | Ortahisar | wikipedia: en:Ortahisar |
| 99f6f76a-4f63-497b-871b-214be9e3e731 | Osun-Osogbo Sacred Grove | wikimedia_commons: Splendor of the Goddess - Glamous Osun Devotees 31.jpg |
| a0120eb9-0349-40ae-a1f8-658fdd577e4b | Palacio de Wilanów | wikipedia: es:Palacio de Wilanów |
| ed79db2c-5cfa-40e0-b8f9-6f4e766df849 | Pergamon | wikipedia: en:Pergamon |
| 37bd976d-6cca-4da4-bc0f-0f7ddffc755b | Perinaldo | wikipedia: es:Perinaldo |
| f858c09a-ae38-4804-9db0-0fa758aa28df | Pic du Midi de Bigorre | wikipedia: es:Pic du Midi de Bigorre |
| 8a31c450-dda1-4efc-90a0-97097eb26fc4 | Pietrapertosa | wikipedia: es:Pietrapertosa |
| 5b4b1d39-35ff-455b-8056-de7bdfa92f6c | Prayer Mountain Hanwa | wikimedia_geosearch: Zaria - Sokoto Road 1.jpg |
| 8dd068d3-98d7-4cb6-8e49-c1f60c8e7d99 | Rango | wikimedia_commons: 小林敏明総領事.jpg |
| c95621fb-a0ab-4bdc-bb65-d095f9b24491 | Ring of Brodgar | wikipedia: en:Ring of Brodgar |
| 53032874-8498-4831-bee9-74339c988e04 | Sabbioneta | wikipedia: es:Sabbioneta |
| b312485a-ebe6-42f9-bc3c-cf96c751ef1b | Samy's Curry Restaurant | wikimedia_geosearch: SBG Megaskepasma erythrochlamys 1107.jpg |
| 60569e3e-64c4-4155-8f54-0bbb49597421 | San Benedetto Po | wikipedia: es:San Benedetto Po |
| b477b270-1395-473a-bd50-4ce2ec544b28 | Seborga | wikipedia: es:Seborga |
| 834d45e5-ceda-464e-a748-10aa103820db | Şirince Köyü | wikimedia_commons: Şirince, Turkey. - panoramio.jpg |
| c14a2f92-4361-41e3-ab33-b78b3cae8554 | Skara Brae | wikipedia: es:Skara Brae |
| 351185f5-34c6-4b83-990d-c44c85c32d84 | Subótica | wikimedia_geosearch: Subotica, radnice.jpg |
| 4898412f-fa31-49c0-948a-b46c567ff3ab | Timbuktu Manuscripts | wikipedia: en:Timbuktu Manuscripts |
| f9df6ee4-536a-41f1-837f-405b9c3979aa | Tomb of Askia | wikipedia: en:Tomb of Askia |
| 87924368-c1f7-4af9-9e6f-82fabe615149 | Uçhisar Belediyesi | wikimedia_commons: Uçhisar-Nevşehir Merkez-Nevşehir, Turkey - panoramio (3).jpg |
| d85bbb5f-a9b9-4de8-b42f-9cfceed08473 | Valentine Texas Bar | wikimedia_geosearch: The Hi Way Cafe in little Valentine in Jeff Davis County, west Texas LCCN2014631035.tif |
| 6ccbfaa1-40f8-40ce-aa03-4f23ef8488e9 | Whitby Abbey | wikipedia: en:Whitby Abbey |
| 293742e6-11eb-406c-82c0-c79c36fb5e79 | White Cliffs of Dover | wikipedia: en:White Cliffs of Dover |
| 9f2f4f4e-5264-45d3-96e7-d4e8729a1552 | Yanartas Hostel | wikimedia_geosearch: OLYMPOS-ÇIRALI - panoramio.jpg |
| b6fadf55-d6d0-44e0-a287-c32cc5bb663f | Yunak Evleri | wikimedia_geosearch: Asmali Konak - panoramio.jpg |
| 6497ba27-c76d-4406-a936-89c149faef88 | Yvoire | wikipedia: es:Yvoire |
| bae8bf48-721a-4ed1-98c3-dcd990e27b7a | Zuma Rock | wikipedia: en:Zuma Rock |

## Rejected (6 entradas)

| id | name | reason | kind | source |
|---|---|---|---|---|
| 4663baa3-f97f-47ac-a819-2a404ee3ebc4 | Trevélez | flag_or_coat_of_arms_regex_l1_backfill | symbolic | wikipedia: es:Trevélez |
| 53115fb5-9679-484e-b657-1537b29668fa | Genalguacil | flag_or_coat_of_arms_regex_l1_backfill | symbolic | wikipedia: es:Genalguacil |
| aa50a907-b73f-4253-8a89-77d4cf9247b5 | Olivenza | flag_or_coat_of_arms_regex_l1_backfill | symbolic | wikipedia: es:Olivenza |
| aa58f037-4cbb-4102-a5ef-a661e96dd724 | Zahara de la Sierra | flag_or_coat_of_arms_regex_l1_backfill | symbolic | wikipedia: es:Zahara de la Sierra |
| f1e5a1b2-5b59-4fd1-a409-33bd643e8570 | Åland | heraldic_token_in_filename | symbolic | wikipedia |
| f43da01c-c22c-4db3-95c5-930626ba6b2b | Níjar | flag_or_coat_of_arms_regex_l1_backfill | symbolic | wikipedia: es:Níjar |

## None (7 — ningún candidato definitivo)

| id | name |
|---|---|
| 5f33d012-1e80-47ae-ad5a-990dde7a6a68 | Antogo Fishing Frenzy |
| 776c9dd5-709d-4575-81d7-79d4248519e1 | Antogo Fishing Frenzy |
| 62a325ea-20a9-415b-b940-cd2935f8a3ec | Baños del Somogil |
| 5be45f82-b175-4561-9e82-cfd8a1991020 | Kerio Valley National Park |
| 5df3a148-aec7-4234-ab3f-38dc209396e7 | Nuraghe Sardajara |
| 6e181e40-9433-49a8-9f7e-17300e9574d0 | Ojo de Buey o L'Arco |
| 79b43699-7a69-49a8-88f6-794af9c55b59 | Yacimiento de fósiles de Cuevas Labradas |
