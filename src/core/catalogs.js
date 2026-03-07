// EGGlogU — Catalogs, Breeds, Curves & Translations
// Extracted from monolith: COMMERCIAL_BREEDS, BREED_CURVES, CATALOGS, CATALOG_T

import { getLang } from './i18n.js';

export const COMMERCIAL_BREEDS=[
{id:'leghorn-blanca',name:'Leghorn Blanca',eggsYear:'280-320',eggColor:'blanco',eggWeight:'55-60g',type:'hibrida',fcr:'2.0-2.1',notes:'Mas usada mundialmente, excelente FCR'},
{id:'isa-brown',name:'ISA Brown',eggsYear:'300-320',eggColor:'marron',eggWeight:'60-65g',type:'hibrida',fcr:'2.0-2.2',notes:'Hibrida lider global, muy docil'},
{id:'hyline-w36',name:'Hy-Line W-36',eggsYear:'300-320',eggColor:'blanco',eggWeight:'63g',type:'hibrida',fcr:'2.0-2.1',notes:'Excelente en climas calidos'},
{id:'hyline-w80',name:'Hy-Line W-80',eggsYear:'290-310',eggColor:'blanco',eggWeight:'60g',type:'hibrida',fcr:'2.1-2.2',notes:'Huevo mediano, alta persistencia'},
{id:'lohmann-brown',name:'Lohmann Brown',eggsYear:'290-310',eggColor:'marron',eggWeight:'62-65g',type:'hibrida',fcr:'2.1-2.2',notes:'Muy popular en LATAM/Europa'},
{id:'hisex-brown',name:'Hisex Brown',eggsYear:'300-320',eggColor:'marron',eggWeight:'62g',type:'hibrida',fcr:'2.0-2.2',notes:'Similar a ISA, muy productiva'},
{id:'golden-comet',name:'Golden Comet',eggsYear:'280-300',eggColor:'marron',eggWeight:'60g',type:'hibrida',fcr:'2.1-2.3',notes:'Hibrida de rapida produccion'},
{id:'shaver-white',name:'Shaver White',eggsYear:'280-300',eggColor:'blanco',eggWeight:'60g',type:'hibrida',fcr:'2.1-2.2',notes:'Blanca eficiente, buena en calor'},
{id:'rhode-island-red',name:'Rhode Island Red',eggsYear:'250-300',eggColor:'marron',eggWeight:'60g',type:'pura',fcr:'2.3-2.5',notes:'Robusta, doble proposito'},
{id:'australorp',name:'Australorp',eggsYear:'250-280',eggColor:'marron',eggWeight:'60g',type:'pura',fcr:'2.3-2.5',notes:'Resistente, record historico 364 huevos/ano'},
{id:'sussex',name:'Sussex',eggsYear:'250-280',eggColor:'crema',eggWeight:'58g',type:'pura',fcr:'2.4-2.6',notes:'Buena conversion, adaptable'},
{id:'plymouth-rock',name:'Plymouth Rock',eggsYear:'200-250',eggColor:'marron',eggWeight:'55g',type:'pura',fcr:'2.5-2.7',notes:'Familiar, huevos constantes'},
{id:'ameraucana',name:'Ameraucana',eggsYear:'200-250',eggColor:'azul',eggWeight:'55g',type:'pura',fcr:'2.5-2.7',notes:'Huevo azul, nicho premium'},
{id:'araucana',name:'Araucana',eggsYear:'180-220',eggColor:'azul-verde',eggWeight:'52g',type:'pura',fcr:'2.6-2.8',notes:'Originaria de Chile, huevo verde-azulado'},
{id:'marans',name:'Marans',eggsYear:'180-220',eggColor:'chocolate',eggWeight:'65g',type:'pura',fcr:'2.5-2.7',notes:'Huevo color chocolate oscuro, nicho gourmet'},
{id:'otra',name:'Otra / Personalizada',eggsYear:'-',eggColor:'-',eggWeight:'-',type:'-',fcr:'-',notes:'Raza no listada, usa curva generica'}
];

export const BREED_CURVES={
'leghorn-blanca':[10,36,66,86,94,96,97,97,96,96,95,94,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43],
'isa-brown':[9,32,62,83,92,94,95,95,94,94,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43],
'hyline-w36':[10,35,65,85,93,95,96,96,95,95,94,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42],
'hyline-w80':[9,33,63,84,92,94,95,95,94,94,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43],
'lohmann-brown':[8,30,60,82,91,94,95,95,94,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42],
'hisex-brown':[9,31,61,83,92,94,95,95,94,94,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43],
'golden-comet':[9,30,58,80,90,93,94,94,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41],
'shaver-white':[9,33,63,84,92,94,94,94,93,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42],
'rhode-island-red':[6,22,48,72,84,88,90,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37],
'australorp':[5,20,45,68,82,86,88,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37,36,35],
'sussex':[5,18,42,65,80,84,86,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37,36,35,34,33],
'plymouth-rock':[4,15,38,60,74,78,80,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37,36,35,34,33,32,31,30,29,28,27],
'ameraucana':[4,14,36,58,72,76,78,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37,36,35,34,33,32,31,30,29,28,27,26,25],
'araucana':[3,12,32,54,68,72,74,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37,36,35,34,33,32,31,30,29,28,27,26,25,24,23,22,21],
'marans':[3,12,32,52,66,70,72,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37,36,35,34,33,32,31,30,29,28,27,26,25,24,23,22,21,20,19],
'otra':[8,28,55,78,88,92,93,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40],
'generic':[8,28,55,78,88,92,93,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40]
};

export const CATALOGS={
feedTypes:[
{id:'inicio',name:'Inicio (0-6 sem)',protein:'20-22%',stage:'cria'},
{id:'crecimiento',name:'Crecimiento (6-12 sem)',protein:'18-19%',stage:'recria'},
{id:'desarrollo',name:'Desarrollo (12-16 sem)',protein:'15-16%',stage:'recria'},
{id:'pre-postura',name:'Pre-postura (16-18 sem)',protein:'17-18%',stage:'recria'},
{id:'postura-1',name:'Postura Fase 1 (18-45 sem)',protein:'17-18%',stage:'produccion'},
{id:'postura-2',name:'Postura Fase 2 (45-65 sem)',protein:'16-17%',stage:'produccion'},
{id:'postura-3',name:'Postura Fase 3 (65+ sem)',protein:'15-16%',stage:'produccion'},
],
deathCauses:['Enfermedad','Depredador','Golpe de calor','Asfixia','Canibalismo','Prolapso','Edad/Natural','Accidente','Desconocida'],
diseases:['Newcastle','Gumboro (IBD)','Bronquitis Infecciosa','Coccidiosis','Marek','Salmonelosis','Coriza Infecciosa','Viruela Aviar','Influenza Aviar','Micoplasmosis','Laringotraquetis','Colibacilosis','Aspergilosis','Histomoniasis'],
medications:[
{name:'Enrofloxacina',type:'antibiotico',withdrawal:7},
{name:'Amoxicilina',type:'antibiotico',withdrawal:5},
{name:'Toltrazuril',type:'anticoccidial',withdrawal:14},
{name:'Ivermectina',type:'antiparasitario',withdrawal:14},
{name:'Tilosina',type:'antibiotico',withdrawal:5},
{name:'Oxitetraciclina',type:'antibiotico',withdrawal:7},
{name:'Vitamina AD3E',type:'suplemento',withdrawal:0},
{name:'Electrolitos',type:'suplemento',withdrawal:0},
],
personnelRoles:['Administrador','Tecnico Avicola','Galponero','Recolector','Veterinario','Chofer/Repartidor','Limpieza','Mantenimiento'],
visitorPurposes:['Entrega de alimento','Servicio tecnico','Inspeccion sanitaria','Retiro de huevos','Visita veterinaria','Mantenimiento','Otro'],
ventilationLevels:['Natural','Baja','Media','Alta','Tunel'],
bioProtocols:['Desinfeccion de galpon','Pediluvio','Control de roedores','Fumigacion','Limpieza de bebederos','Limpieza de comederos','Desratizacion','Vacio sanitario'],
expenseDescriptions:{
feed:['Alimento postura','Alimento cria','Suplementos','Aditivos'],
vaccines:['Vacuna Newcastle','Vacuna Gumboro','Vacuna Marek','Otra vacuna'],
transport:['Distribucion huevos','Retiro alimento','Traslado aves'],
labor:['Sueldos','Horas extra','Bonos'],
infrastructure:['Reparacion galpon','Equipamiento','Nidales','Bebederos'],
other:['Servicios basicos','Asesoria','Varios'],
},
};

export const VACCINE_SCHEDULE=[
{weekMin:1,weekMax:1,name:'Marek',route:'SC/IM',notes:'Day-old chick, hatchery'},
{weekMin:1,weekMax:2,name:'Newcastle + Bronquitis Infecciosa',route:'Eye drop/Spray',notes:'Live vaccine'},
{weekMin:2,weekMax:3,name:'Gumboro (IBD)',route:'Drinking water',notes:'Intermediate strain'},
{weekMin:3,weekMax:4,name:'Newcastle refuerzo',route:'Drinking water',notes:'Booster'},
{weekMin:4,weekMax:5,name:'Gumboro (IBD)',route:'Drinking water',notes:'Second dose'},
{weekMin:6,weekMax:8,name:'Viruela Aviar',route:'Wing web',notes:'If endemic area'},
{weekMin:8,weekMax:10,name:'Encefalomielitis Aviar',route:'Drinking water',notes:'Live vaccine'},
{weekMin:10,weekMax:12,name:'Coriza Infecciosa',route:'IM',notes:'If endemic area'},
{weekMin:12,weekMax:14,name:'Salmonella',route:'IM',notes:'Pre-lay'},
{weekMin:14,weekMax:16,name:'Newcastle + BI pre-postura',route:'IM',notes:'Killed vaccine'},
];

// CATALOG_T — translations for catalog values per language
export const CATALOG_T={
en:{
'Enfermedad':'Disease','Depredador':'Predator','Golpe de calor':'Heat stroke','Asfixia':'Suffocation','Canibalismo':'Cannibalism','Prolapso':'Prolapse','Edad/Natural':'Age/Natural','Accidente':'Accident','Desconocida':'Unknown',
'Newcastle':'Newcastle','Gumboro (IBD)':'Gumboro (IBD)','Bronquitis Infecciosa':'Infectious Bronchitis','Coccidiosis':'Coccidiosis','Marek':'Marek','Salmonelosis':'Salmonellosis','Coriza Infecciosa':'Infectious Coryza','Viruela Aviar':'Fowl Pox','Influenza Aviar':'Avian Influenza','Micoplasmosis':'Mycoplasmosis','Laringotraquetis':'Laryngotracheitis','Colibacilosis':'Colibacillosis','Aspergilosis':'Aspergillosis','Histomoniasis':'Histomoniasis',
'Enrofloxacina':'Enrofloxacin','Amoxicilina':'Amoxicillin','Toltrazuril':'Toltrazuril','Ivermectina':'Ivermectin','Tilosina':'Tylosin','Oxitetraciclina':'Oxytetracycline','Vitamina AD3E':'Vitamin AD3E','Electrolitos':'Electrolytes',
'Administrador':'Administrator','Tecnico Avicola':'Poultry Technician','Galponero':'House Keeper','Recolector':'Collector','Veterinario':'Veterinarian','Chofer/Repartidor':'Driver/Delivery','Limpieza':'Cleaning','Mantenimiento':'Maintenance',
'Inicio (0-6 sem)':'Starter (0-6 wk)','Crecimiento (6-12 sem)':'Grower (6-12 wk)','Desarrollo (12-16 sem)':'Developer (12-16 wk)','Pre-postura (16-18 sem)':'Pre-lay (16-18 wk)','Postura Fase 1 (18-45 sem)':'Layer Phase 1 (18-45 wk)','Postura Fase 2 (45-65 sem)':'Layer Phase 2 (45-65 wk)','Postura Fase 3 (65+ sem)':'Layer Phase 3 (65+ wk)',
'Entrega de alimento':'Feed delivery','Servicio tecnico':'Technical service','Inspeccion sanitaria':'Health inspection','Retiro de huevos':'Egg pickup','Visita veterinaria':'Veterinary visit','Otro':'Other',
'Natural':'Natural','Baja':'Low','Media':'Medium','Alta':'High','Tunel':'Tunnel',
'Desinfeccion de galpon':'House disinfection','Pediluvio':'Footbath','Control de roedores':'Rodent control','Fumigacion':'Fumigation','Limpieza de bebederos':'Waterer cleaning','Limpieza de comederos':'Feeder cleaning','Desratizacion':'Deratization','Vacio sanitario':'Sanitary void',
'Alimento postura':'Layer feed','Alimento cria':'Starter feed','Suplementos':'Supplements','Aditivos':'Additives','Vacuna Newcastle':'Newcastle vaccine','Vacuna Gumboro':'Gumboro vaccine','Vacuna Marek':'Marek vaccine','Otra vacuna':'Other vaccine','Distribucion huevos':'Egg distribution','Retiro alimento':'Feed pickup','Traslado aves':'Bird transfer','Sueldos':'Wages','Horas extra':'Overtime','Bonos':'Bonuses','Reparacion galpon':'House repair','Equipamiento':'Equipment','Nidales':'Nest boxes','Bebederos':'Waterers','Servicios basicos':'Utilities','Asesoria':'Consulting','Varios':'Miscellaneous',
'Newcastle + Bronquitis Infecciosa':'Newcastle + Infectious Bronchitis','Newcastle refuerzo':'Newcastle booster','Encefalomielitis Aviar':'Avian Encephalomyelitis','Salmonella':'Salmonella','Newcastle + BI pre-postura':'Newcastle + IB pre-lay',
},
pt:{
'Enfermedad':'Doenca','Depredador':'Predador','Golpe de calor':'Golpe de calor','Asfixia':'Asfixia','Canibalismo':'Canibalismo','Prolapso':'Prolapso','Edad/Natural':'Idade/Natural','Accidente':'Acidente','Desconocida':'Desconhecida',
'Inicio (0-6 sem)':'Inicial (0-6 sem)','Crecimiento (6-12 sem)':'Crescimento (6-12 sem)','Desarrollo (12-16 sem)':'Desenvolvimento (12-16 sem)','Pre-postura (16-18 sem)':'Pre-postura (16-18 sem)','Postura Fase 1 (18-45 sem)':'Postura Fase 1 (18-45 sem)','Postura Fase 2 (45-65 sem)':'Postura Fase 2 (45-65 sem)','Postura Fase 3 (65+ sem)':'Postura Fase 3 (65+ sem)',
},
fr:{
'Enfermedad':'Maladie','Depredador':'Predateur','Golpe de calor':'Coup de chaleur','Asfixia':'Asphyxie','Canibalismo':'Cannibalisme','Prolapso':'Prolapsus','Edad/Natural':'Age/Naturel','Accidente':'Accident','Desconocida':'Inconnue',
'Inicio (0-6 sem)':'Demarrage (0-6 sem)','Crecimiento (6-12 sem)':'Croissance (6-12 sem)','Desarrollo (12-16 sem)':'Developpement (12-16 sem)','Pre-postura (16-18 sem)':'Pre-ponte (16-18 sem)','Postura Fase 1 (18-45 sem)':'Ponte Phase 1 (18-45 sem)','Postura Fase 2 (45-65 sem)':'Ponte Phase 2 (45-65 sem)','Postura Fase 3 (65+ sem)':'Ponte Phase 3 (65+ sem)',
},
de:{
'Enfermedad':'Krankheit','Depredador':'Raubtier','Golpe de calor':'Hitzschlag','Asfixia':'Erstickung','Canibalismo':'Kannibalismus','Prolapso':'Prolaps','Edad/Natural':'Alter/Naturlich','Accidente':'Unfall','Desconocida':'Unbekannt',
'Inicio (0-6 sem)':'Starter (0-6 Wo)','Crecimiento (6-12 sem)':'Wachstum (6-12 Wo)','Desarrollo (12-16 sem)':'Entwicklung (12-16 Wo)','Pre-postura (16-18 sem)':'Vorlegephase (16-18 Wo)','Postura Fase 1 (18-45 sem)':'Legephase 1 (18-45 Wo)','Postura Fase 2 (45-65 sem)':'Legephase 2 (45-65 Wo)','Postura Fase 3 (65+ sem)':'Legephase 3 (65+ Wo)',
},
it:{
'Enfermedad':'Malattia','Depredador':'Predatore','Golpe de calor':'Colpo di calore','Asfixia':'Asfissia','Canibalismo':'Cannibalismo','Prolapso':'Prolasso','Edad/Natural':'Eta/Naturale','Accidente':'Incidente','Desconocida':'Sconosciuta',
'Inicio (0-6 sem)':'Avviamento (0-6 sett)','Crecimiento (6-12 sem)':'Crescita (6-12 sett)','Desarrollo (12-16 sem)':'Sviluppo (12-16 sett)','Pre-postura (16-18 sem)':'Pre-deposizione (16-18 sett)','Postura Fase 1 (18-45 sem)':'Deposizione Fase 1 (18-45 sett)','Postura Fase 2 (45-65 sem)':'Deposizione Fase 2 (45-65 sett)','Postura Fase 3 (65+ sem)':'Deposizione Fase 3 (65+ sett)',
},
ja:{
'Enfermedad':'疾病','Depredador':'捕食者','Golpe de calor':'熱中症','Asfixia':'窒息','Canibalismo':'共食い','Prolapso':'脱肛','Edad/Natural':'老齢/自然死','Accidente':'事故','Desconocida':'不明',
'Inicio (0-6 sem)':'スターター (0-6週)','Crecimiento (6-12 sem)':'成長期 (6-12週)','Desarrollo (12-16 sem)':'育成期 (12-16週)','Pre-postura (16-18 sem)':'産卵前期 (16-18週)','Postura Fase 1 (18-45 sem)':'産卵期1 (18-45週)','Postura Fase 2 (45-65 sem)':'産卵期2 (45-65週)','Postura Fase 3 (65+ sem)':'産卵期3 (65週以上)',
},
zh:{
'Enfermedad':'疾病','Depredador':'捕食者','Golpe de calor':'中暑','Asfixia':'窒息','Canibalismo':'啄食癖','Prolapso':'脱肛','Edad/Natural':'老龄/自然死亡','Accidente':'事故','Desconocida':'不明',
'Inicio (0-6 sem)':'开食料 (0-6周)','Crecimiento (6-12 sem)':'生长料 (6-12周)','Desarrollo (12-16 sem)':'育成料 (12-16周)','Pre-postura (16-18 sem)':'预产料 (16-18周)','Postura Fase 1 (18-45 sem)':'产蛋期1 (18-45周)','Postura Fase 2 (45-65 sem)':'产蛋期2 (45-65周)','Postura Fase 3 (65+ sem)':'产蛋期3 (65周以上)',
}
};

/** Translate catalog value to current language */
export function tc(str) {
  const lang = getLang();
  if (lang === 'es' || !CATALOG_T[lang]) return str;
  return CATALOG_T[lang][str] || str;
}
