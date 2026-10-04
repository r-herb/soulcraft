# Uzdevums aģentam: interaktīvs Soulcraft storyboard

## Tava loma un mērķis

Tu esi spēļu prezentāciju dizainers un frontend izstrādātājs. Uztaisi **interaktīvu, animētu storyboard** spēlei **Soulcraft** (https://soulcraft.8nomads.com). Tam jāparāda, kas šajā spēlē notiek un kā to spēlē, no pirmās minūtes līdz beigu bosam un dzīvei īstajā Malagas pilsētā.

Storyboard skatās cilvēks, kurš spēli vēl nav spēlējis. Pēc tā izskatīšanas viņam jāsaprot:
1. kas ir Soulcraft un ar ko tas atšķiras no citām blokveida spēlēm;
2. kā spēlē (vadība, izdzīvošana, būvēšana);
3. kādi ir galvenie mērķi (pieci sargi, Dārgumu meklējumi);
4. ko var darīt Malagā (īsta pilsēta, autobusi, banka, restorāni);
5. kā spēlēt kopā ar draugiem.

## Kas jāuztaisa (tehniskās prasības)

- **Viena pašpietiekama HTML lapa** (HTML + CSS + JavaScript vienā failā, bez būvēšanas soļa). Ārējās bibliotēkas drīkst ielādēt tikai no CDN (piemēram, GSAP vai anime.js animācijām), bet lapai jāstrādā arī bez tām, tikai vienkāršākā izskatā.
- **Ainas (scenes)**, pa kurām lietotājs pārvietojas ar pogām "Atpakaļ" un "Tālāk", ar tastatūras bultiņām un ar pavilkšanu (swipe) telefonā. Augšā vai apakšā ir progresa josla ar nodaļām, uz kurām var uzklikšķināt.
- Katrā ainā ir:
  - virsraksts;
  - 1-3 īsi teikumi;
  - **animēta ilustrācija**, kas parāda darbību, nevis tikai statisks attēls. Zīmē ar SVG, Canvas vai CSS no vienkāršiem kubiņiem un pikseļu formām. Nekādus attēlus no interneta un nekādus Minecraft zīmolus neizmanto.
- Vēlams: poga "Atskaņot automātiski", kas pati iet cauri ainām (apmēram 6-8 sekundes katrā), ar pauzi.
- Jāstrādā gan telefonā (ainava un portrets), gan datorā. Teksts ir salasāms, pogas pietiekami lielas pirkstam.
- Jāievēro `prefers-reduced-motion`: tad animācijas ir mierīgākas vai statiskas.
- **Valoda:** latviešu. Spēles nosaukumus raksti tā, kā tie ir latviešu versijā (tie doti zemāk), ar oriģinālo angļu nosaukumu iekavās, kur tas palīdz.
- **Tipogrāfija:** nekad nelieto garās domuzīmes (Unicode U+2014 un U+2013), tikai parasto defisi (-).

### Vizuālais stils

- Spēle ir pikseļu un kubu stilā, bet ar savu identitāti: tumši nakts zili fona toņi, ciānzilais "dvēseļu" mirdzums (soul crystals), zelts naudai un dārgumiem, sarkanīgi oranžā "kvēle" (ember) uguns pasaulei.
- Virsrakstu fonts pikseļu stilā (spēlē izmanto "Press Start 2P", ar latviešu burtu atbalstu), teksts vienkāršā bezserifu fontā.
- Animāciju idejas:
  - bloki, kas lūst un parādās;
  - diennakts maiņa (debesis kļūst tumšas, parādās monstri);
  - kristāli, kas mirdz;
  - autobuss, kas brauc pa Malagas ielu;
  - monētas, kas ieslīd makā;
  - bosa uzbrukumi ar brīdinājuma zīmēm.

## Svarīgs noteikums par faktiem

Izmanto **tikai** zemāk aprakstīto spēles saturu. Neizdomā funkcijas, kuru nav.

Sadaļā "Idejas nākotnei" ir lietas, kuru spēlē **vēl nav**. Ja tās rādi, liec tās atsevišķā pēdējā nodaļā ar skaidru atzīmi "Drīzumā", nekad kā esošu spēles daļu.

---

# SPĒLES ROKASGRĀMATA (avota materiāls)

## 1. Kas ir Soulcraft

Soulcraft ir 3D blokveida smilšu kastes spēle pārlūkā (pirmās personas skatā), veidota vispirms telefonam (ainavas režīmā), bet strādā arī datorā.
- Spēlētājs rok un būvē, izdzīvo naktis, tirgojas ar ciematniekiem, atver jaunus izskatus (skinus) un pieveic piecus sargus, lai atbrīvotu dvēseles.
- Visa grafika, vārdi, tēli un skaņas ir oriģināli un ģenerēti kodā.
- Spēle ir 4 valodās: angļu, krievu, spāņu, latviešu.

**Ekrāns un HUD:**
- augšā pa kreisi: sirdis (veselība), stilbiņi (izsalkums), dvēseļu kristālu skaits, diennakts skaitītājs, dzīvību skaits (3) un monētas;
- stūrī: apaļa minikarte;
- apakšā: rīku josla (hotbar) ar 9 vietām.

## 2. Vadība

| Darbība | Telefons | Dators |
|---|---|---|
| Iet | vilkt ekrāna kreiso pusi (virtuāla kursorsvira) | W A S D |
| Skatīties | vilkt ekrāna labo pusi | pele |
| Lēkt, peldēt augšup | bultas poga | atstarpe |
| Lauzt, sist | turēt āmura/zobena pogu | kreisā peles poga |
| Likt bloku, ēst, tirgoties, izmantot | kuba poga | labā peles poga vai F |
| Inventārs un amatniecība | režģa poga | E |
| Karte | kartes poga | M |
| Pauze | pauzes poga | Esc |

Pirmajā reizē apmācība parāda soli pa solim: iet, skatīties, lauzt, likt, izveidot dēļus, un brīdina, ka naktī nāk ienaidnieki.

## 3. Pasaules un režīmi

- Līdz 6 pasaulēm. Pierakstītam spēlētājam tās glabājas mākonī un ir pieejamas no jebkuras ierīces.
- **Izdzīvošana (Survival):** vākt, taisīt lietas, izdzīvot naktis, pelnīt dvēseļu kristālus.
- **Radošais (Creative):** nav bojājumu un izsalkuma, bloki lūst uzreiz, ir visi bloki. Var lidot (divreiz lēkt). Kristāli šeit nekrājas.
- **Biomi:** tālāk no sākuma vietas ir tuksneši (kāpas, smilšakmens, kaktusi, kas dur) un sniega lauki (sasaluši ezeri, sniegotas priedes). Alās ir daudz rūdas, lavas baseini un mirdzoši kristāli uz grīdas.
- **Rūdas:** ogles, dzelzs, zelts, dvēseļu rūda un dziļi pazemē (zem y 20) dimanti.

## 4. Izdzīvošana

- **Diena un nakts.** Naktī parādās monstri:
  - **Tukšulis** (Hollow), sadeg saulē;
  - **Čabulis** (Skitter), ātrs rāpulis;
  - **Drūmais strēlnieks** (Gloomshot), šauj no attāluma.
- Pret tiem var uzbūvēt patvērumu vai izgatavot zobenu.
- **Izsalkums:** jāēd (saules auglis, maize, cepetis, mirdzošā zupa, kā arī Malagas ēdieni, sk. 10. nodaļu).
- **Amatniecība:** 3x3 režģis ar receptēm. Recepšu grāmata pati saliek vajadzīgo.
  - rīki: koka, akmens, dzelzs un emberīta cērtes;
  - ieroči: zobeni, loks un bultas, šķēps;
  - būvmateriāli un lukturi.
- **Nāve:** parādās atdzimšanas ekrāns, un spēlētājs atdzimst mājas punktā.

## 4b. Lauku sēta: dārzeņi un mājlopi

- **Dārzeņi:**
  - kviešu un tomātu sēklas un burkāni tirgus stendā;
  - sēj uz zāles vai zemes, un zeme kļūst par aramzemi;
  - augs aug 4 stadijās (apmēram 7,5 minūtes spēles laika);
  - nobriedis augs dod ražu un sēklas atpakaļ;
  - no kviešiem cep maizi un maļ miltus.
- **Mājlopi (vistas, aitas, govis):**
  - dienā klīst pa zāli grupās, tirgus stendā tos var nopirkt kastē;
  - seko spēlētājam, ja tas tur rokā to barību;
  - divi pabaroti pieaugušie dabū mazuli;
  - vistas dēj olas, aitas dod vilnu, gaļu cep ar oglēm.
- **Apelsīni:** koku lapas reizēm nomet apelsīna sēklu; iestādīta tā izaug par apelsīnu krūmu; nogatavojušos augļus noplūc ar "izmantot" (2 līdz 4), un krūms ražo atkal.
- **Vistu kūts:** ligzdas kaste (5 dēļi un kvieši) savāc olas no vistām 6 bloku attālumā; ar "izmantot" tās paņem. Malagas parkos dienā arī staigā vistas.
- **Inkubators** (stikls, ogles, dēļi): ieliec līdz 4 olām; pēc 3 minūtēm spēles katra izšķiļas par cāli, tā vistu bizness aug bez kastu pirkšanas.
- Ražu, apelsīnus, olas, vilnu un gaļu var pārdot biržā, vai paturēt sēklas un olas un audzēt vairāk.

### Ieroči un vārdi virs galvas
- Jauni ieroči darbgaldā: **dimanta zobens**, **duncis** (vājš, bet ļoti ātrs), **kaujas cirvis** (lēns, stiprs, atsit tālu), **kaujas āmurs** (trāpa arī visiem briesmoņiem apkārt), **arbalets** (bultas tālāk un stiprāk nekā loks), **metamie naži** (pēc metiena var pacelt) un **dvēseļu zizlis** (gaismas lodes bez munīcijas). Arbaletu, nažus un cirvi piedāvā arī ciema iedzīvotāji.
- Virs katra spēlētāja galvas ir viņa **vārds** kā Roblox: lieli balti burti ar tumšu kontūru, redzami arī caur sienām līdz 90 blokiem; adminiem zelta krāsā. Savu vārdu redzi trešās personas skatā (F5).

### Bruņas un vairogi

- Kā klasiskajā Minecraft: **ķivere, bruņu veste, bruņu bikses un zābaki** no ādas (no govīm), zelta, dzelzs, dimanta vai emberīta; tos uzvelk 4 bruņu ailēs inventārā (vai ar "izmantot", turot rokā).
- Bruņu punkti (dzelzs 2, 6, 5, 2; dimants un emberīts 3, 8, 6, 3; ne vairāk kā 20) redzami kā vestīšu rinda virs sirsniņām; katrs punkts noņem 4% no monstru, apsargu vai kaktusu sitiena (līdz 80%); kritieni, lava un bads iet cauri.
- Katrs sitiens bruņas nedaudz nolieto; nolietots gabals saplīst.
- **Vairogs** (dēļi un dzelzs): turot "izmantot", tas paceļas un pilnībā aptur sitienu no priekšas (ne no sāniem vai aizmugures); ar paceltu vairogu iet lēnāk.

### Šeideri un animācijas

- Iestatījumos **Šeideri** (ieslēgti): lapas, zāle un labība šūpojas vējā, ūdens viļņojas un mirdz saulē, saullēktā un saulrietā gaisma kļūst zeltaina, naktī zilgana.
- Monstri elpo, pagriež galvu pret tuvu spēlētāju, sitot nolaiž rokas, no trieciena atraujas un pēc nāves nokrīt un nogrimst zemē.

### Spēlēt kopā ar draugiem

- Galvenajā ekrānā zaļā poga **Spēlēt ar draugiem**: redzami draugi ar atvērtām pasaulēm (Pievienoties), un var sākt savu pasauli kopā (jauna Malaga, jauna pasaule vai pēdējā). Pasaule uzreiz atveras draugiem, un draugu sarakstā pie katra drauga ir poga **Uzaicināt**.
- Uzaicinātajam spēlē parādās karte ar **Pievienoties** (ar skaņu), bet, ja spēle ir aizvērta, viņš saņem paziņojumu.
- **Malaga kopā:** misijas un lielā misija ir kopīgas; ko dara jebkurš komandā, skaitās visiem, un katrs saņem balvas. Kad dimants ir apmainīts, visa komanda kļūst par Malagas mēriem.
- **Zvani:** zvans skan, līdz atbild; ja spēle ir fonā, nāk sistēmas paziņojums; ja aizvērta, Web Push pamodina telefonu (draugu sarakstā "Ieslēgt" paziņojumus).

## 5. Ciemati, tirdzniecība un Dvēseļu veikals

- **Ciemati:** mājas ar durvīm uz centru un aka vidū. Ciematnieki tirgojas: dod, piemēram, 6 baļķus pret 2 maizēm. Jo biežāk tirgojies, jo lielāka draudzība un jo labāki piedāvājumi.
- Pie akas stāv **Bankomāts**, **Tirgus stends** un **Restorāns** (ciemata krogs) (sk. 10. nodaļu).
- **Dvēseļu kristāli** ir spēles "dvēseles valūta". Tos dod dienas uzdevumi, sargi, Dārgumu meklējumi un reizēm monstri.
- **Dvēseļu veikals:**
  - Skini: Klejotājs (bez maksas), Sūnu sargs (40), Kvēles izlūks (80), Sala meistars (80), Saules bruņinieks (150), Bezdibeņa gājējs (200), Garu lukturis (300), Vētras jātnieks (500).
  - Pavadoņi: **Uguns lapsa** (60) kož monstriem, **Ledus pūce** (120) lido un šauj ledus šķembas, **Sūnu golems** (200) atsit monstrus. Līdzi nāk viens; ja to notriec, tas atpūšas 30 sekundes.

## 6. Galvenais stāsts: pieci sargi un Dvēseļu karte

1. Spēlētājs izgatavo **Bezdibeņa lukturi** (stikls, dzelzs, ogles un 12 dvēseļu kristāli), kas atver **Dvēseļu karti**.
2. Uz kartes ir pasaules (realms) un sargi, kas jāpieveic pēc kārtas. Katra uzvara atslēdz nākamo:
   1. **Bezdibeņa pūķis** (Void Dragon), pasaulē **Bezdibenis**: salauz tukšuma kristālus, tad sit, kad tas nirst lejup.
   2. **Gliemežvāku karalis** (Shell King), **Dvēseļu valstībā**: izvairies no tumšajiem gliemežvākiem, mirdzošos atsit viņam atpakaļ.
   3. **Viesuļu karalis** (Whirlwind King), **Pārbaudījumu zālē**: vēju var ievainot tikai vējš, tāpēc vāc **Vēja lādiņus** un met tos.
   4. **Kvēles sargs** (Ember Warden), **Kvēles dzīlēs**: emberīta un zelta asmeņi kož visdziļāk, uzmanies no Uguns gariem.
   5. **Dvēseļu vētra** (Soul Storm), **Dvēseļu valstībā**: visas pazudušās dvēseles vienā vētrā.
3. Bosiem ir fāzes, brīdinājumi ("Nirst - kusties!") un veselības josla.
4. Pēc pēdējā sarga: **"Vētra ir norimusi"** ekrāns ar statistiku (spēles laiks, izdzīvotās dienas, salauztie un noliktie bloki, uzvarētie ienaidnieki, nāves, nopelnītie kristāli). Pasaule paliek tava, un tajā var turpināt būvēt.

## 7. Dārgumu meklējumi (atsevišķs piedzīvojumu režīms)

Leģenda vēsta par apslēptu dārgumu glabātuvi. Spēlētājs drupās atrod dārgumu karti un iziet 12 pārbaudījumus. Ir kontrolpunkti: nokrītot, spēlētājs atgriežas pie pēdējā.

1. **Kartes drupas:** labirints, kurā paslēpta karte.
2. **Debesu pakāpieni:** lēkšana pār tukšumu.
3. **Bultu zāle:** sienu slazdi iedegas sarkani, pirms šauj.
4. **Briesmoņu midzenis:** vārti aizcērtas, līdz visi monstri pieveikti.
5. **Sviru mīkla:** katra svira pārslēdz savu lampu un kaimiņus, jāiededz visas četras.
6. **Drūpošais tilts:** bloki krīt magmā zem kājām.
7. **Atslēgu birzs:** trīs zelta atslēgas (dzīvžoga labirintā, dīķī, tornī).
8. **Atmiņas flīzes:** atkārto gaismas secību.
9. **Ēnu labirints:** tumšs labirints ar monstriem.
10. **Lēciena plāksnes:** zaļie paliktņi aizmet pāri spraugām.
11. **Būvnieka aiza:** pats uzbūvē dēļu tiltu.
12. **Dārgumu golems** (Hoard Golem): izvairies no uzskrējiena, tad sit atsegto mirdzošo kodolu.

**Atlīdzība:** skins **Dārgumu mednieks**, **Zvaigžņkrituma asmens** un 250 dvēseļu kristāli. Tie parādās arī visās parastajās pasaulēs.

**2. nodaļa: Ledus smaile** (durvis glabātuves aizmugurē):
1. Ledus slidkalniņš;
2. Mirgojošais tilts;
3. Vēju tornis;
4. Sala plāksnes;
5. Sala strūklas;
6. Lodu sacīkste (6 sala lodes pret laiku);
7. Sala midzenis;
8. **Ledus sargs** (Frost Warden): izkāp no lēciena apļa; kad tā kājas sasalušas, sitieni skaitās divkārši.

**Atlīdzība:** skins **Ledus valdnieks**, zobens **Sala asmens** (Frostbrand) un 300 kristālu.

## 8. Dienas uzdevumi un sezonas notikumi

- Katru dienu **3 uzdevumi** (vieni un tie paši visiem): salauz N blokus, noliec N blokus, pieveic N monstrus, izroc N rūdas, tirgojies N reizes, izgatavo N lietas, apēd N maltītes, noej N blokus, izdzīvo nakti.
- Par izpildītu uzdevumu dod kristālus, par visiem trim ir bonuss.
- Izpildītie uzdevumi skaitās arī **pilsētas algai** (sk. 11. nodaļu).
- Sezonas notikumi:
  - **Ziedu dienas** (1.-20. aprīlis): lido ziedlapiņas, uzdevumi maksā divreiz vairāk.
  - **Ražas mirdzums** (15. oktobris - 5. novembris): krēslā ceļas dzirksteles, monstri kristālus met 3 reizes biežāk.
  - **Sniegputenis** (10. decembris - 6. janvāris): visur snieg, un pirmais ciematnieks katru dienu uzdāvina dāvanu.

## 9. Pasaules karte, dzīvības un minikarte

- **Pasaules karte** (M vai minikarte): reljefs, ciemati, draugi, atdzimšanas punkts. Karti var vilkt un pietuvināt.
- **Ceļošana:** uzsit uz vietas uz kartes un apstiprini, lai tur nokļūtu. Šī vieta kļūst par jauno atdzimšanas punktu.
  - Izdzīvošanā viens ceļojums maksā **1 no 3 dzīvībām**, un katru jaunu spēles dienu 1 dzīvība atgriežas.
  - Radošajā režīmā ceļošana ir bez maksas.
- **Minikarte** stūrī rāda apkārtni ar ziemeļiem augšā, spēlētāja bultu, ciematus, pieturas un autobusus.

## 10. MALAGA: īsta pilsēta spēlē

Titula ekrānā poga **Malaga** atver pasauli, kas uzbūvēta no **īstā Malagas centra** (Spānija) mērogā **1 bloks = 1 metrs**.
- Teritorija: visa Malaga iekšpus apvedceļa, no lidostas un Guadalhorce upes līdz El Palo (ap 15,6 x 10,9 km, ap 135 000 ēku).
- Ir īstie pakalni (Alcazaba un Gibralfaro), ielas, laukumi, parki, pludmale un **ap 135 000 ēku** ar īstajām kontūrām un augstumiem.
- Dati nāk no OpenStreetMap.
- Var spēlēt radošajā režīmā (lidot, visi bloki) vai izdzīvošanā (naktī nāk monstri) un kopā ar draugiem.

### Kur sāc un ko redzi

- Spēle sākas **Plaza de la Constitución** laukumā vecpilsētā.
- Orientieri kartē:
  - **Calle Larios** (galvenā iepirkšanās iela);
  - **Katedrāle**;
  - **Alcazaba** (mauru cietoksnis);
  - **Gibralfaro** (pils kalna galā);
  - **Muelle Uno** (osta);
  - **La Malagueta** (pludmale);
  - **Plaza de la Merced**;
  - **Paseo del Parque**;
  - **El Limonar**;
  - jaunie rajoni: **lidosta** (Aeropuerto), **El Palo** un **Pedregalejo** pludmales, **Huelin**, **La Misericordia**, **Teatinos** (universitāte), **La Rosaleda** stadions, **María Zambrano** stacija, **Ciudad Jardín**;
  - **Banco de España** (centrālā banka).
- **Ielu nosaukumi** uzkrāsoti uz brauktuves ar lieliem bloku burtiem (C/, AV., PZA.), lai tos var izlasīt, lidojot virs pilsētas.
- **Māju numuri:** zili balti numuru plāksnītes virs durvīm, kā īstajā Malagā. Ap 45 000 mājām ir numurs.
- **Pilsēta dzīvo:**
  - zivis jūrā un ostā;
  - peldētāji baseinos;
  - sauļotāji ar saulessargiem pludmalē;
  - gājēji gājēju ielās dienas laikā.

### Autobusi (īstie EMT maršruti un saraksti)

- Pa pilsētu brauc **īstās EMT Malaga autobusu līnijas** pa saviem īstajiem maršrutiem, pēc **īstā saraksta** un Malagas laika. Visi spēlētāji redz to pašu autobusu tajā pašā vietā.
- Līnijas: 72 no 74 virzieniem ar īsto sarakstu; ir arī nakts līnijas, piemēram, N1.
- **Pieturas:** 860 pieturas (1037 zilas pieturas zīmes). Izmantojot zīmi, redzi nākamos autobusus katrai līnijai (pēc minūtēm un pulksteņa laika) un vari parādīt līnijas uz kartes.
- **Iekāpšana:**
  - biļetes pērk pie pieturas zīmes (viens brauciens **2 monētas**, bonobús 10 braucieni **13**) vai pie vadītāja;
  - autobusi brauc **pa labo pusi** kā Spānijā, katrs savā joslā, ar durvīm labajā pusē (šoferis kreisajā);
  - autobusi brauc **divreiz ātrāk** nekā īsti (12 m/s), pieturās stāv 12 sekundes, un starp diviem reisiem, kas atiet vairāk nekā 10 minūšu atstarpē, kursē vēl viens;
  - vienā joslā vienā virzienā autobusi **stāv rindā** viens aiz otra, nevis brauc cauri;
  - virs katras pieturas zīmes ir **tablo**: pieturas nosaukums, līnija, galapunkts un pēc cik minūtēm nāk nākamais autobuss;
  - autobusā var **staigāt** pa abiem stāviem (WASD vai kursorsvira) un pieturā izkāpt, izejot pa atvērtām durvīm;
  - autobusi ir divstāvu ar **atvērtu augšējo stāvu**; pieturā atveras durvis: ieej pa tām vai nospied F (labais klikšķis, Mac skārienpaliktnī klikšķis ar diviem pirkstiem); pie autobusa kartīte rāda, kā iekāpt, cik braucienu atlicis un kur nopirkt biļeti;
  - iekšā ir vadītājs un **kontrolieris**; biļeti **nopīkstina** dzeltenajā validatorā (zaļa gaisma); bez biļetes kontrolieris izsēdina, kad durvis aizveras;
  - ar derīgu biļeti var **uzkāpt augšā** un braukt ar skatu pār pilsētu;
  - **STOP** (X) - izkāpt nākamajā pieturā; no augšējā stāva var arī **izlēkt**;
  - viesi un radošajā režīmā brauc bez maksas.
- **Lidošana** radošajā režīmā: 4 ātrumi (V vai poga): 1x, 2,5x, 5x, 10x.
- Pasaules kartē ir slānis **Autobusi** ar līnijām, pieturām un kustīgiem autobusiem.

### El Gran Golpe: Malagas lielā misija

- **12 uzdevumi**, katram spēlētājam nejauši izvēlēti no 18, ved pa visu Malagu pie **informatoriem** (tumšā mētelī un cepurē, virs galvas zelta "!"): lidosta, La Rosaleda, universitāte, stacija (ar autobusu), Atarazanas tirgus (nopirkt sardīnes), El Palo (paēst restorānā), Pedregalejo (skalot zeltu), Huelin (atvērt slēptuvi), pludmales, pilis, katedrāle, Muelle Uno, El Limonar, Ciudad Jardín, Plaza de la Merced, Calle Larios un Paseo del Parque; daži vispirms grib dārgakmeni vai olu.
- Katrs uzdevums dod 25 monētas un **bankas plāna gabaliņu**. Gabaliņi ir **puzle** (pauze > misijas > bankas plāns): pieskaries gabaliņam, tad tā vietai; nepareizā vieta nodreb.
- Salikts plāns (arī priekšmets) rāda **vājo vietu** seifa aizmugurējā sienā un **apsargu maršrutus**.
- **Fināls:** no bankas aizmugures izlauz vājo sienu (dzelzs cērte), iekļūsti seifā garām trim apsargiem (aiz letes, pie seifa durvīm, seifā) un paņem **Gran Diamante**. Apsargs, kas tevi ierauga aiz letes, seifā vai ar dimantu, šauj (izdzīvošanā) vai izved ārā un noliek dimantu atpakaļ (radošajā).
- Aiznes dimantu 60 blokus prom, tad pie bankas letes apmaini to pret lielāko summu spēlē: **1 000 000 monētu** (vienreiz kontam; serveris maksā tikai pēc 12 reģistrētiem uzdevumiem).
- Pilsēta tevi ievēl par **Malagas mēru**: ceremonija ar uguņošanu virs bankas; mēru saraksts bankas cilnē "Pilsēta".

### Pamācības
- Pirmo reizi Malagā ekrānā parādās kartīte, kas atver **pilsētas ceļvedi**: kā pārvietoties, nauda, ēdiens, misijas, El Gran Golpe, La Fábrica, dārgakmeņi, ferma, draugi.
- Katrai misijai ir **pamācība**: visi soļi pēc kārtas (izpildītie nosvītroti, pašreizējais izcelts), padomi un balva. Tā atveras, pirmo reizi sekojot misijai, un ar ? pogu.
- Ja spēlētājs nomirst ar Gran Diamante, apsargi to aiznes atpakaļ uz seifu.

### Citi veidi, kā tikt seifā
- Kad plāns salikts, misijās parādās četri jauni informatori (ar zobrata zīmi), un katrs dod rīku:
  - **apsarga uniforma** (drēbnieks Calle Larios): 45 sekundes apsargi tevi uzskata par savējo;
  - **kanalizācijas atslēga** (strādnieks pie Paseo del Parque): lūka bankas zāles stūrī ved pa zemu tuneli ar lampām līdz lūkai seifa grīdā;
  - **petardes** (pirotehniķis Muelle Uno): ārpus bankas visi apsargi uz 25 sekundēm skrien pie durvīm;
  - **seifa durvju kods** (nakts sargs Mercado de Atarazanas, pēc kopīgas maltītes): durvis atveras uz 40 sekundēm; naktī dežūrē tikai viens apsargs.
- **Ar draugiem:** viens bankas zālē dejo vai māj, un apsargi skatās šovu, kamēr pārējie iet iekšā; drauga petardes dzird visi.

### La Fábrica: 1. sezona
- Otrā lielā Malagas misija, slavenā TV laupīšanas seriāla stilā, bet ar savu stāstu. Sākas misiju sarakstā.
- **El Maestro** gaida fermā kalnā virs Ciudad Jardín. Viņa **stunda**: pieci uzdevumi uz tāfeles, tad viktorīna ar 5 jautājumiem (4 pareizi - nokārtots, citādi stunda vēlreiz). Pēc tam spēlētājs izvēlas **segvārdu** un pievienojas komandai: Levante, Poniente, Terral un Siroco (Malagas vēji).
- **Sagatavošanās:** četri kontakti pilsētā dod sarkanos kombinezonus (Plaza de la Merced), maskas (katedrāle), kravas auto (María Zambrano stacija) un rasējumus (Teatinos).
- **Ielaušanās:** vecā tabakas fabrika **La Tabacalera** tagad ir naudas kaltuve: preses, papīrs un tinte pie sienas, sarkanais telefons pie durvīm, ēdnīca un palešu telpa aizmugurē.
- **Aplenkums:** jānodrukā 10 naudas paletes. Prese prasa papīra rulli un tintes kannu; dažreiz iestrēgst. Jāsaglabā **policijas pacietība**: atbildēt uz **sarkano telefonu** (mierīgas atbildes palīdz), noturēt **reidu** pie priekšējām vai aizmugurējām durvīm, noķert strādnieku, kas mēģina izlavīties. Neviens netiek ievainots. Ja pacietība beidzas, policija ielaužas un ieeja jāsāk no jauna.
- **Tunelis:** ar 10 paletēm atveras lūka palešu telpā; caur mīkstu zemi jārok līdz lūkai vestibilā, un tā ved ārā ar naudas maisiem.
- **Bēgšana:** maisi jānogādā El Maestro fermā: sezonas beigas, 25 000 monētu par maisu (vienreiz kontam), kristāli, **sarkanais kombinezons** un **smaidošā maska** tēlam.
- Ar draugiem: aplenkumu vada saimnieka spēle; viesu darbības aiziet saimniekam.

### La Fábrica: 2. sezona, zelts
- Atveras pēc 1. sezonas beigām. Siroco pēc fabrikas tika notverts; El Maestro aicina komandu atpakaļ uz otro stundu (5 nodarbības, viktorīna).
- **Atbrīvošanas rīki:** viltots pārvešanas rīkojums (Mercado de Atarazanas), policijas forma (Calle Larios), gatava laiva (La Malagueta).
- **Siroco atbrīvošana:** Muelle Uno dežurants uzdod trīs jautājumus (kas parakstīja rīkojumu, tā numurs, kurp ved ieslodzīto); atbildes ir stundā. Ar divām pareizām Siroco ir brīvs.
- **Zelta rīki:** niršanas tērpi (Pedregalejo), kausētājs (El Palo), sargu maiņas (Gibralfaro).
- **La Térmica:** vecā ēka pie jūras netālu no La Misericordia: vestibils ar sarkano telefonu un ģeneratoru, zāle ar 4 kausēšanas krāsnīm, 2 sūkņi pie seifa sienas, seifs ar zelta stieņu plauktiem un noteces resti grīdā.
- **Aplenkums:** jāizkausē 12 stieņi. Stieņus nes no plauktiem (pa diviem) uz krāsnīm; tās kausē, kamēr ir strāva. Seifā sūcas ūdens: sūkņiem jāstrādā, citādi seifs applūst un 30 sekundes stieņus ņemt nevar. Policija atslēdz strāvu (iedarbini ģeneratoru), urbj sienu (nostiprini to) un zvana pa sarkano telefonu (inspektore Vega). Neviens netiek ievainots: sargi gaida vestibilā.
- **Caurule un jūra:** ar 12 stieņiem atveras noteces reste; pa cauruli tiec ārā aiz ēkas ar 12 zelta maisiem un aiznes tos uz El Maestro laivu La Misericordia pludmalē: 30 000 monētu par maisu (vienreiz kontam), kristāli, **niršanas tērps** un **zelta maska**.

### La Fábrica: 3. sezona, El Maestro
- Atveras pēc 2. sezonas. Inspektore Vega pludmalē notvēra El Maestro; viņu tur vecajā ostas noliktavā pie Plaza de la Marina. Šoreiz nav aplenkuma: klusa ielaušanās.
- Siroco sauc komandu uz fermu: plāns uz tāfeles un viktorīna. Kontakti: hakeris (La Rosaleda) zina drošinātāju kārbu, atslēdznieks (Huelin) dod **stetoskopu**, laivinieks (Muelle Uno) gaidīs pie Muelle de Heredia.
- **Kameras** zālē griežas, to sarkanie konusi rāda, kur tās skatās; aiz kastes var paslēpties. **Drošinātāju kārba** tās izslēdz uz 25 sekundēm, pēc tam tai vajag minūti. Koridorā divi **lāzeru stari** ieslēdzas un izslēdzas. Ja ierauga vai pieskaries staram, skan trauksme, un komanda izslīd ārā, lai mēģinātu vēlreiz; neviens netiek ievainots.
- **Seifs**: griez ciparripu un klausies ar stetoskopu, klikšķis nozīmē pareizo ciparu; trīs cipari. Iekšā ir kameras atslēga.
- **Kamera**: atslēga to atver, El Maestro seko spēlētājam. Tad skan trauksme: divarpus minūtes līdz laivai pie Muelle de Heredia.
- Balva: 200 000 monētu (vienreiz kontam), kristāli, **kapteiņa cepure** un **nakts redzamības brilles** tēlam.

### Dārgakmeņi un zelts

- Dārgakmeņi pēc īstās vērtības no lētākā līdz dārgākajam: **kvarcs, ametists, topāzs, smaragds, safīrs, rubīns, dimants** (birža maksā 3, 6, 12, 35, 45, 60 un 80 monētas).
- Rūdas aug akmenī pazemē, dārgākās retākas un dziļāk; arī zem Malagas.
- Apmēram katrā astotajā Malagas gabalā ir **dārgakmeņu slēptuve** (akmens vāks ar krāsainiem akmeņiem parkā, dārzā, pludmalē vai laukumā): tā dod 2 līdz 4 dārgakmeņus un bieži zelta graudiņus, vienreiz.
- **Zelta skalojamā panna** (3 dzelzs stieņi) ūdenī (upē, jūrā, strūklakā) apmēram katru ceturto reizi atrod zelta graudiņu; 9 graudiņi = zelta stienis.

### Nauda, banka un birža

- Katram pierakstītam spēlētājam ir maks: **20 monētas** sākumā, monētas kabatā un bankā.
- **Bankomāti:** 172 pie īstajām Malagas bankām un bankomātiem un pa vienam pie katra ciemata akas. Tie atver ekrānu **Banka un birža** ar cilnēm:
  - **Birža:** pārdod savākto (pārtiku, kokus, akmeni, stiklu, stieņus, dimantus) pret monētām vai pērc. Cenas kustas: jo vairāk spēlētāji kaut ko pārdod, jo lētāks tas kļūst, un pirkšana to sadārdzina. Bultiņas rāda tendenci.
  - **Tirgus:** izliec savas mantas pārdošanā citiem spēlētājiem par savu cenu. Tās gaida tirgū, līdz kāds nopērk (pārdevējs saņem ziņu), vai paņem atpakaļ.
  - **Banka:** noguldi un izņem monētas, redzi pēdējās darbības.
  - **Loterija:** biļete 5 monētas, līdz 10 mēnesī. Mēneša beigās viena biļete laimē banku (pilsēta patur desmito daļu).
  - **Pilsēta:** Soulcraft kalendārs, alga un centrālā banka (zelta rezerves, zelta cena, monētas apgrozībā, zelta nodrošinājums).
- Malagā bankomāti tikai **izsniedz un pieņem monētas** (ātri 10, 20, 50, 100 vai jebkura summa). Visu pārējo dara pie **centrālās bankas letes**: Banco de España ir atsevišķa akmens ēka uz marmora laukuma pie Paseo del Parque ar platām durvīm uz ielu, zāli ar kolonnām un lampām, kasieriem aiz letes un **seifu** aizmugurē aiz tērauda durvīm (sienas nevar salauzt). Ciematu bankomāti atver visu banku.
- **Centrālā banka** glabā pilsētas bagātību zeltā. Zelta stieņi, ko pārdod biržā, papildina rezerves.
- Lai neviens nevarētu pārpludināt pilsētu ar izdomātām mantām, katram spēlētājam dienā ir pārdošanas limits katrai precei (piemēram, 8 dimanti).

### Ēdiens: veikali, gatavošana, restorāni

- **Tirgus stendi:** 449 pie īstajiem Malagas pārtikas veikaliem un pa vienam katrā ciematā. Tur pārdod tomātus, apelsīnus, rīsus, sardīnes, olīveļļu, miltus, maizi un ogles.
- **Gatavošana pie darbgalda** (ogles ir uguns):
  - **Espetos**: sardīne, iesms, ogles. Tās ir sardīnes uz iesma, Malagas specialitāte.
  - **Gaspačo**: 3 tomāti un olīveļļa.
  - **Paelja**: rīsi, sardīne, tomāti, olīveļļa, ogles; iznāk 2 porcijas.
  - **Čurrosi**: milti, olīveļļa, ogles; iznāk 2.
- **Restorāni:** 1151 Malagas restorāns, kafejnīca un bārs, kā arī ciemata krogs. Tur šos ēdienus pasniedz uzreiz: ātrāk un sātīgāk, bet 2-3 reizes dārgāk. Paēdušam neko nepasniedz.

### Ko Malagā var darīt (aktivitātes)

Malagā ir 5 **misijas** (pauzes izvēlne - "Malagas misijas"). HUD augšā rāda izvēlēto misiju, bultu un attālumu līdz nākamajai vietai, bet minikartē ir zelta zvaigzne:
- **Tūrista maršruts:** Plaza de la Constitución, katedrāle, Alcazaba, Gibralfaro, La Malagueta (+60 monētas, +20 kristāli).
- **Ar autobusu uz pludmali:** iekāp autobusā, nobrauc vismaz 2 pieturas un izkāp pie La Malagueta; ja izkāp agrāk, jāsāk no jauna (+40, +10).
- **Paeljas meistars:** nopērc rīsus, pagatavo paelju un apēd to La Malagueta pludmalē (+50, +15).
- **Restorānu kritiķis:** paēd 3 dažādos restorānos (+30, +10).
- **Pirmie ietaupījumi:** noguldi monētas bankā (+10, +5).

Kristāli nāk izdzīvošanas režīmā, bet monētas pilsēta izmaksā vienreiz par katru misiju pierakstītiem spēlētājiem. Bez misijām pilsēta ir atvērta pasaule, kurā dari:
1. **Izpēti orientierus:** aizej no Plaza de la Constitución pa Calle Larios līdz Katedrālei, uzkāp Alcazaba un Gibralfaro, nonāc pludmalē La Malagueta un ostā Muelle Uno.
2. **Brauc ar autobusu:** atrodi pieturu, apskati sarakstu, iekāp un aizbrauc uz citu rajonu, vai brauc uz jumta.
3. **Ceļo ar karti:** aizlido uz jebkuru vietu, izdzīvošanā tas maksā dzīvību.
4. **Nopelni un tērē naudu:** pārdod savākto biržā, noguldi bankā, pērc produktus, gatavo paelju, paēd restorānā, spēlē loteriju, tirgojies ar citiem spēlētājiem.
5. **Pildi dienas uzdevumus** izdzīvošanas pasaulē un saņem mēnešalgu no pilsētas.
6. **Būvē** jebkur pilsētā, arī radošajā režīmā.
7. **Spēlē kopā ar draugiem** tajā pašā Malagas pasaulē.
8. **Izdzīvo nakti** pilsētā, kur monstri nāk no ielām.

## 11. Pilsētas dzīve: kalendārs, alga, loterija

- **Soulcraft kalendārs:** laiks iet 24 reizes ātrāk. Soulcraft diena ir 1 īsta stunda, mēnesis ir 1 īsta diennakts (beidzas pusnaktī pēc UTC), gads ir 12 dienas.
  - Mēnešiem ir nosaukumi: Salnu, Sējas, Lietus, Ausmas, Ziedoņa, Saulgriežu, Kvēles, Ražas, Zeltlapu, Miglas, Dvēseļu, Zvaigžņu mēnesis.
- **Mēnešalga no pašvaldības** par tā mēneša kvestiem: 6 monētas par dienas uzdevumu, 40 par sargu, 8 par Dārgumu meklējumu līmeni, līdz 300. To izmaksā mēneša beigās.
- **Loterija:** izloze notiek katra mēneša beigās, un uzvarētājs saņem ziņu.

## 12. Kopā ar draugiem

- **Konts:** reģistrācija un pieteikšanās; pasaules glabājas mākonī.
- **Draugi:** pievieno pēc lietotājvārda. Draugu sarakstā redzams, kurš ir tiešsaistē un kurā pasaulē, un ar pogu **Pievienoties** var ielēkt drauga pasaulē.
- **Kopīga pasaule:**
  - līdz 4 spēlētājiem;
  - saimnieks atver pasauli un saņem 6 zīmju istabas kodu;
  - visi redz tās pašas izmaiņas un tos pašus monstrus.
- **Čats:**
  - privātas sarunas ar draugiem;
  - publiskais **Lobijs** (Lobby) un kanāli, kuros admins ielaiž;
  - nelasīto skaits;
  - drauga ziņa parādās spēles laikā.
- **Zvani:** datorā ar video un skaņu, telefonā tikai ar skaņu. Zvanā var pievienot vairākus draugus. Zvana logs peld stūrī virs spēles.
- **Admini** moderē čatu, bloķē pārkāpējus un uzrauga ekonomiku.
- **Roblox stila tēli:** pasaule paliek kubiņos, bet spēlētājs var nomainīt pikseļu figūru pret **3D tēlu**: liela apaļa galva ar gludu seju, rokas un kājas, kas liecas elkoņos un ceļos.
  - Tēlu atbloķē par 150 dvēseļu kristāliem vai bez maksas par jebkuru sasniegumu.
  - **Garderobē** ("Mans tēls") tēls griežas 3D; var mainīt ādas toni, seju, matus un to krāsu, cepures, kreklus, bikses, brilles un lietas uz muguras (mugursoma, ģitāra, apmetnis, reaktīvā soma, spārni).
  - Labākās lietas dod tikai sasniegumi: mēra kronis un uzvalks (Malagas mērs), laupītāja maska (El Gran Golpe), bruņinieka ķivere (visi 5 bosi), eņģeļa spārni (30. diena), pētnieka cepure (Dārgumu meklējumi), sarkanais kombinezons un smaidošā maska (La Fábrica), niršanas tērps un zelta maska (La Fábrica 2), kapteiņa cepure un nakts redzamības brilles (La Fábrica 3). Par īstu naudu nekas netiek pārdots.
  - Emocijas: māt, dejot, priecāties; draugi tās redz.
  - F5 vai tēla poga pārslēdz kameru: no acīm, no mugurpuses, no priekšpuses.

---

# STORYBOARD STRUKTŪRA (ieteicamā ainu secība)

Vari pielāgot, bet saglabā nodaļas un loģisko secību. Katrai ainai ir norādīta animācijas ideja.

**1. nodaļa: Sveiks, Soulcraft**
1. **Titula aina:** logo "Soulcraft", zem tā "Būvē. Izdzīvo. Atbrīvo dvēseles." Kubi saplūst logo, ciānzili kristāli mirdz.
2. **Tavs ekrāns:** HUD elementi parādās pa vienam ar norādēm (sirdis, izsalkums, kristāli, dzīvības, monētas, minikarte, rīku josla).
3. **Vadība:** telefona siluets ar kursorsviru kreisajā pusē un pogām labajā; pirksts demonstrē vilkšanu. Blakus datora tastatūra ar izgaismotiem W A S D.

**2. nodaļa: Rok, būvē, izdzīvo**
4. **Lauz un liec:** cērte sit bloku, tas saplaisā un pazūd, tad jauns bloks nostājas vietā.
5. **Amatniecība:** 3x3 režģis, baļķis kļūst par dēļiem, dēļi par nūjām, tad par cērti.
6. **Nakts nāk:** debesis satumst, iznirst Tukšulis, Čabulis un Drūmais strēlnieks. Spēlētājs uzceļ patvērumu, rītausmā Tukšulis sadeg saulē.
7. **Biomi un alas:** ātra panorāma: zaļš mežs, tuksnesis ar kaktusiem, sniega lauki, ala ar lavu un mirdzošiem kristāliem, dimanta rūda dziļumā.

**3. nodaļa: Ciemati un kristāli**
8. **Ciematnieki:** tirdzniecības apmaiņa (6 baļķi pret 2 maizēm) un draudzības josla, kas pieaug.
9. **Dvēseļu veikals:** skinu karuselis un pavadoņi (Uguns lapsa, Ledus pūce, Sūnu golems) cīņā.
10. **Dienas uzdevumi:** trīs kartītes ar atzīmēm, kristāli ieplūst skaitītājā, un sezonas notikumu ikonas.

**4. nodaļa: Pieci sargi**
11. **Bezdibeņa lukturis un Dvēseļu karte:** lukturis iedegas, atveras karte ar 5 pasaulēm, pirmā ir atslēgta.
12-16. **Viens sargs katrā ainā:** tā pasaule, galvenais triks (piemēram, atsisti gliemežvāku vai met vēja lādiņu) un brīdinājuma zīme.
17. **Vētra norimusi:** uzvaras ekrāns ar statistikas skaitītājiem, kas skrien uz augšu.

**5. nodaļa: Dārgumu meklējumi**
18. **Leģenda:** vecā karte atritinās.
19. **12 pārbaudījumu montāža:** mazas kartītes pēc kārtas, katrai 1 sekundes animācija (bultas lido, tilts brūk, flīzes iedegas...).
20. **Dārgumu golems un glabātuve:** zelta lāde atveras, izlido skins, zobens un 250 kristāli.
21. **Ledus smaile:** zilgana nodaļa ar ledu, strūklām un Ledus sargu.

**6. nodaļa: Malaga**
22. **Īsta pilsēta:** lidojums virs Malagas; parādās uzraksts "1 bloks = 1 metrs"; kamera nolaižas Plaza de la Constitución.
23. **Orientieri:** maršruts uz kartes, punkti iedegas pa vienam (Calle Larios, Katedrāle, Alcazaba, Gibralfaro, La Malagueta, Muelle Uno).
24. **Ielas dzīvo:** uzkrāsots ielas nosaukums no augšas, māju numuri, peldētāji, sauļotāji, zivis.
25. **Autobuss:** pieturas zīme ar sarakstu (līnija, "pēc 3 min"), autobuss piebrauc, spēlētājs iekāp (-2 monētas), cits uzrāpjas uz jumta un brauc līdzi.
26. **Banka un birža:** bankomāts, cenu grafiks, kas krīt, kad daudz pārdod, monētas ieslīd makā, zelts centrālajā bankā.
27. **Pārtika:** tirgus stends, tad gatavošana (tomāti un olīveļļa kļūst par gaspačo), tad restorāns (paelja uz galda, cena).
28. **Pilsētas dzīve:** kalendārs, kas griežas (diena = stunda), algas josla, kas pieaug no uzdevumiem, loterijas bumbiņas.

**7. nodaļa: Kopā ar draugiem**
29. **Draugi un istabas kods:** 6 zīmju kods, draugi ielec pasaulē, kopā būvē.
30. **Čats un zvani:** ziņu burbuļi, zvana logs stūrī ar video kvadrātiem.

**8. nodaļa: Beigu aina**
31. "Spēlē tagad: soulcraft.8nomads.com", poga, kas ved uz spēli, un aicinājums spēlēt telefonā ainavas režīmā.

**(Neobligāti) 9. nodaļa: Drīzumā** (skaidri atzīmēta kā nākotne):
- bankas aplaupīšana (kvesti un apsardze);
- vairāk pilsētu.

## Kvalitātes pārbaude pirms nodošanas

- Katrai ainai ir redzama animācija, un tā neaizsedz tekstu.
- Navigācija strādā ar pogām, bultiņām un vilkšanu. Automātiskā atskaņošana apstājas, kad lietotājs pats pārslēdz ainu.
- Telefonā portreta režīmā nekas neiziet ārpus ekrāna, un nav horizontālas ritināšanas.
- Visi fakti sakrīt ar šo rokasgrāmatu; skaitļi (cenas, limiti, daudzumi) nav izdomāti.
- Tekstā nav garo domuzīmju (U+2014, U+2013), tikai defises.
