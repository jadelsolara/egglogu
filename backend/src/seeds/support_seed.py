"""
Seed data for EGGlogU Support System — FAQ Articles & Auto-Response Templates.

Run standalone:
    python -m src.seeds.support_seed

Or import and call:
    from src.seeds.support_seed import seed_support
    await seed_support()

Idempotent: checks existing rows before inserting.
"""

import asyncio
import logging

from sqlalchemy import select, func

from src.database import async_session
from src.models.support import AutoResponse, FAQArticle, TicketCategory

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════
# FAQ ARTICLES — 15 bilingual articles for poultry farm support
# ═══════════════════════════════════════════════════════════════════

FAQ_ARTICLES: list[dict] = [
    # ── 1. produccion — Produccion baja de huevos ──
    {
        "category": TicketCategory.produccion,
        "title_es": "Produccion baja de huevos: causas y soluciones",
        "title_en": "Low egg production: causes and solutions",
        "content_es": (
            "Si tu porcentaje de produccion (hen-day) esta por debajo de lo esperado para la edad de tu lote, "
            "revisa estos factores en orden de impacto:\n\n"
            "1. **Programa de luz**: Las gallinas necesitan 16 horas de luz total (natural + artificial) para "
            "mantener produccion optima. Verifica que tus temporizadores funcionen y que la intensidad sea "
            "de al menos 10-20 lux a nivel de comedero.\n\n"
            "2. **Nutricion**: El alimento debe contener 16-18% de proteina cruda, 3.5-4.2% de calcio, y "
            "0.35-0.45% de fosforo disponible. Si cambiaste proveedor de alimento, la caida puede ser "
            "temporal (7-14 dias de adaptacion).\n\n"
            "3. **Agua**: Asegura acceso libre y limpio. La regla general es 1.5-2 veces el consumo de "
            "alimento en litros. Revisa nipples obstruidos y presion de linea.\n\n"
            "4. **Estres**: Ruido excesivo, presencia de depredadores, hacinamiento (>6 aves/m2 en piso), "
            "o cambios bruscos de manejo causan caidas subitas.\n\n"
            "5. **Edad del lote**: La produccion pico ocurre entre las semanas 26-32, luego declina "
            "~0.5-1% semanal de forma natural. Consulta la curva estandar de tu linea genetica.\n\n"
            "6. **Muda**: Una muda natural o inducida detiene la produccion 6-8 semanas. Si no esta "
            "programada, investiga causas de estres.\n\n"
            "7. **Sanidad**: Enfermedades como bronquitis infecciosa, EDS-76 o micoplasma afectan "
            "directamente el oviducto. Revisa signos respiratorios y calidad de cascara.\n\n"
            "En EGGlogU, ve a Dashboard > Graficos de Produccion para comparar tu curva real vs la "
            "estandar de la linea genetica."
        ),
        "content_en": (
            "If your hen-day production percentage is below expected for your flock age, "
            "check these factors in order of impact:\n\n"
            "1. **Lighting program**: Hens need 16 total hours of light (natural + artificial) to "
            "maintain optimal production. Verify your timers work and intensity is at least "
            "10-20 lux at feeder level.\n\n"
            "2. **Nutrition**: Feed should contain 16-18% crude protein, 3.5-4.2% calcium, and "
            "0.35-0.45% available phosphorus. If you changed feed supplier, the drop may be "
            "temporary (7-14 day adaptation).\n\n"
            "3. **Water**: Ensure free and clean access. The general rule is 1.5-2x feed consumption "
            "in liters. Check for clogged nipples and line pressure.\n\n"
            "4. **Stress**: Excessive noise, predators, overcrowding (>6 birds/m2 floor), "
            "or sudden management changes cause abrupt drops.\n\n"
            "5. **Flock age**: Peak production occurs between weeks 26-32, then naturally declines "
            "~0.5-1% weekly. Consult the standard curve for your genetic line.\n\n"
            "6. **Molting**: A natural or induced molt stops production for 6-8 weeks. If unplanned, "
            "investigate stress causes.\n\n"
            "7. **Health**: Diseases like infectious bronchitis, EDS-76, or mycoplasma directly "
            "affect the oviduct. Check for respiratory signs and shell quality.\n\n"
            "In EGGlogU, go to Dashboard > Production Charts to compare your actual curve vs the "
            "genetic line standard."
        ),
        "keywords": "produccion,production,huevos,eggs,postura,laying,hen-day,baja,low,caida,drop",
        "sort_order": 10,
    },
    # ── 2. produccion — Calidad de cascara ──
    {
        "category": TicketCategory.produccion,
        "title_es": "Problemas de calidad de cascara: causas y prevencion",
        "title_en": "Shell quality issues: causes and prevention",
        "content_es": (
            "Los huevos con cascara delgada, rugosa, o deforme indican problemas que deben "
            "corregirse rapidamente para evitar perdidas:\n\n"
            "1. **Calcio insuficiente**: La dieta debe aportar 3.5-4.5 g de calcio/ave/dia. "
            "Usa piedra caliza de particula gruesa (2-4 mm) — se retiene mas tiempo en la molleja "
            "y libera calcio durante la noche cuando se forma la cascara.\n\n"
            "2. **Vitamina D3**: Esencial para la absorcion de calcio. Verifica 2,500-3,000 UI/kg "
            "en la premezcla. En galpones cerrados sin luz solar, la deficiencia es comun.\n\n"
            "3. **Edad del lote**: Gallinas >60 semanas producen huevos mas grandes con la misma "
            "cantidad de cascara, resultando en cascara mas delgada. Aumenta calcio 0.2-0.3% "
            "en la formulacion para lotes viejos.\n\n"
            "4. **Estres termico**: Temperaturas >28C causan jadeo, que reduce CO2 sanguineo y "
            "altera el equilibrio acido-base necesario para depositar carbonato de calcio. "
            "Asegura ventilacion y acceso a agua fresca.\n\n"
            "5. **Bronquitis infecciosa (IB)**: Las cepas nefropatogenas causan cascaras palidas, "
            "rugosas y deformes. Revisa tu programa de vacunacion.\n\n"
            "6. **Micotoxinas**: Aflatoxinas y ocratoxinas en el alimento deterioran la calidad de "
            "cascara. Inspecciona almacenamiento de materias primas.\n\n"
            "En EGGlogU, registra los huevos rotos diariamente en el campo 'Huevos rotos/defectuosos' "
            "para rastrear la tendencia."
        ),
        "content_en": (
            "Eggs with thin, rough, or deformed shells indicate problems that must be "
            "corrected quickly to avoid losses:\n\n"
            "1. **Insufficient calcium**: Diet should provide 3.5-4.5 g calcium/bird/day. "
            "Use coarse-particle limestone (2-4 mm) — it's retained longer in the gizzard "
            "and releases calcium overnight when the shell forms.\n\n"
            "2. **Vitamin D3**: Essential for calcium absorption. Verify 2,500-3,000 IU/kg "
            "in the premix. In closed houses without sunlight, deficiency is common.\n\n"
            "3. **Flock age**: Hens >60 weeks produce larger eggs with the same shell "
            "amount, resulting in thinner shells. Increase calcium 0.2-0.3% in formulation "
            "for older flocks.\n\n"
            "4. **Heat stress**: Temperatures >28C cause panting, reducing blood CO2 and "
            "disrupting the acid-base balance needed for calcium carbonate deposition. "
            "Ensure ventilation and fresh water access.\n\n"
            "5. **Infectious bronchitis (IB)**: Nephropathogenic strains cause pale, rough, "
            "and misshapen shells. Review your vaccination program.\n\n"
            "6. **Mycotoxins**: Aflatoxins and ochratoxins in feed deteriorate shell quality. "
            "Inspect raw material storage.\n\n"
            "In EGGlogU, log broken eggs daily in the 'Broken/defective eggs' field "
            "to track the trend."
        ),
        "keywords": "cascara,shell,calidad,quality,roto,broken,delgada,thin,deforme,deformed,calcio,calcium",
        "sort_order": 20,
    },
    # ── 3. sanidad — Calendario de vacunas ──
    {
        "category": TicketCategory.sanidad,
        "title_es": "Calendario de vacunacion para gallinas ponedoras",
        "title_en": "Vaccination schedule for laying hens",
        "content_es": (
            "Un programa de vacunacion efectivo es la base de la sanidad. Este es un calendario "
            "general — ajusta segun la situacion epidemiologica de tu region:\n\n"
            "**Cria (0-6 semanas):**\n"
            "- Dia 1: Marek (HVT+SB1) en incubadora\n"
            "- Dia 7-10: Newcastle (B1/La Sota) + Bronquitis infecciosa (H120) — ocular/nasal\n"
            "- Dia 14: Gumboro (IBD) — agua de bebida\n"
            "- Dia 21: Gumboro refuerzo (cepa intermedia)\n"
            "- Semana 4-5: Newcastle + BI refuerzo — spray grueso o agua\n\n"
            "**Recria (6-16 semanas):**\n"
            "- Semana 6-8: Viruela aviar + Encefalomielitis — puncion alar\n"
            "- Semana 8-10: Newcastle + BI (oleosa/emulsionada) — inyeccion SC o IM\n"
            "- Semana 10-12: Coriza infecciosa (si hay prevalencia en zona)\n"
            "- Semana 12-14: EDS-76 + Newcastle oleosa — inyeccion\n"
            "- Semana 14-16: Salmonella (si aplica por regulacion)\n\n"
            "**Produccion (16+ semanas):**\n"
            "- Cada 8-12 semanas: Newcastle viva (La Sota) — agua de bebida\n"
            "- Monitoreo serologico trimestral para evaluar titulos\n\n"
            "**Importante:** Usa agua sin cloro para vacunas en agua de bebida. "
            "Agrega leche descremada (2 g/L) como estabilizador. Vacuna en las horas "
            "mas frescas del dia.\n\n"
            "En EGGlogU, registra cada vacunacion en Sanidad > Vacunas para recibir "
            "recordatorios automaticos de refuerzos."
        ),
        "content_en": (
            "An effective vaccination program is the foundation of flock health. This is a general "
            "schedule — adjust according to your region's epidemiological situation:\n\n"
            "**Brooding (0-6 weeks):**\n"
            "- Day 1: Marek's (HVT+SB1) at hatchery\n"
            "- Day 7-10: Newcastle (B1/La Sota) + Infectious Bronchitis (H120) — eye/nasal drop\n"
            "- Day 14: Gumboro (IBD) — drinking water\n"
            "- Day 21: Gumboro booster (intermediate strain)\n"
            "- Week 4-5: Newcastle + IB booster — coarse spray or water\n\n"
            "**Rearing (6-16 weeks):**\n"
            "- Week 6-8: Fowl pox + Avian encephalomyelitis — wing web\n"
            "- Week 8-10: Newcastle + IB (oil emulsion) — SC or IM injection\n"
            "- Week 10-12: Infectious coryza (if prevalent in area)\n"
            "- Week 12-14: EDS-76 + Newcastle oil — injection\n"
            "- Week 14-16: Salmonella (if regulated)\n\n"
            "**Production (16+ weeks):**\n"
            "- Every 8-12 weeks: Live Newcastle (La Sota) — drinking water\n"
            "- Quarterly serology monitoring to evaluate titers\n\n"
            "**Important:** Use chlorine-free water for drinking water vaccines. "
            "Add skim milk powder (2 g/L) as stabilizer. Vaccinate during the "
            "coolest hours of the day.\n\n"
            "In EGGlogU, log each vaccination in Health > Vaccines to receive "
            "automatic booster reminders."
        ),
        "keywords": "vacuna,vaccine,calendario,schedule,newcastle,gumboro,marek,bronquitis,sanidad,health",
        "sort_order": 30,
    },
    # ── 4. sanidad — Pico de mortalidad ──
    {
        "category": TicketCategory.sanidad,
        "title_es": "Pico de mortalidad: como investigar y actuar",
        "title_en": "Mortality spike: how to investigate and respond",
        "content_es": (
            "Si la mortalidad diaria supera el 0.1% o duplica el promedio de los ultimos 7 dias, "
            "actua inmediatamente:\n\n"
            "**Paso 1 — Documentar:**\n"
            "- Registra la mortalidad exacta en EGGlogU de inmediato\n"
            "- Toma fotos de las aves muertas (posicion, estado corporal)\n"
            "- Anota la ubicacion dentro del galpon (zona caliente, cerca de entrada, etc.)\n\n"
            "**Paso 2 — Necropsia de campo:**\n"
            "- Abre 3-5 aves recien muertas (menos de 2 horas)\n"
            "- Busca lesiones clasicas: petequias en proventriculos (Newcastle), riñones inflamados "
            "(Gumboro/IB nefro), higado amarillento (hepatitis), hemorragias musculares\n"
            "- Evalua estado de ovario y oviducto en ponedoras\n\n"
            "**Paso 3 — Muestras al laboratorio:**\n"
            "- Envia 3-5 aves refrigeradas (NO congeladas) al laboratorio de diagnostico\n"
            "- Solicita: histopatologia, PCR para Newcastle/IA, cultivo bacteriano\n"
            "- Plazo de resultados: 48-72 horas\n\n"
            "**Paso 4 — Acciones inmediatas:**\n"
            "- Administra electrolitos + vitaminas en agua\n"
            "- Verifica ventilacion (amoniaco <25 ppm, temperatura 18-24C)\n"
            "- Revisa el alimento por posible contaminacion con micotoxinas\n"
            "- Aisla lotes afectados si es posible\n"
            "- Notifica al veterinario y al SENASA/SAG de tu pais si sospechas enfermedad de reporte obligatorio\n\n"
            "**Causas no infecciosas comunes:** Golpe de calor (>35C), intoxicacion por "
            "sal o ionoforos en dieta de postura, canibalismo, prolapso."
        ),
        "content_en": (
            "If daily mortality exceeds 0.1% or doubles the 7-day average, "
            "act immediately:\n\n"
            "**Step 1 — Document:**\n"
            "- Record exact mortality in EGGlogU immediately\n"
            "- Take photos of dead birds (position, body condition)\n"
            "- Note location within the house (hot zone, near entrance, etc.)\n\n"
            "**Step 2 — Field necropsy:**\n"
            "- Open 3-5 freshly dead birds (less than 2 hours)\n"
            "- Look for classic lesions: proventriculus petechiae (Newcastle), swollen kidneys "
            "(Gumboro/IB nephro), yellowish liver (hepatitis), muscle hemorrhages\n"
            "- Evaluate ovary and oviduct status in layers\n\n"
            "**Step 3 — Lab samples:**\n"
            "- Send 3-5 refrigerated (NOT frozen) birds to diagnostic lab\n"
            "- Request: histopathology, PCR for Newcastle/AI, bacterial culture\n"
            "- Results timeline: 48-72 hours\n\n"
            "**Step 4 — Immediate actions:**\n"
            "- Administer electrolytes + vitamins in water\n"
            "- Check ventilation (ammonia <25 ppm, temperature 18-24C)\n"
            "- Inspect feed for possible mycotoxin contamination\n"
            "- Isolate affected flocks if possible\n"
            "- Notify your veterinarian and national animal health authority if you suspect "
            "a reportable disease\n\n"
            "**Common non-infectious causes:** Heat stroke (>35C), salt or ionophore "
            "poisoning in layer diets, cannibalism, prolapse."
        ),
        "keywords": "mortalidad,mortality,muerte,death,pico,spike,necropsia,necropsy,brote,outbreak",
        "sort_order": 40,
    },
    # ── 5. alimento — FCR alto ──
    {
        "category": TicketCategory.alimento,
        "title_es": "FCR alto: como mejorar la conversion alimenticia",
        "title_en": "High FCR: how to improve feed conversion ratio",
        "content_es": (
            "El FCR (Feed Conversion Ratio) en ponedoras se mide como kg de alimento / kg de huevo "
            "producido. Un FCR optimo es 2.0-2.2 para lotes en pico. Si supera 2.5, investiga:\n\n"
            "1. **Desperdicio de alimento**: Comederos mal ajustados son la causa #1. El nivel "
            "de alimento en comedero de canal no debe superar 1/3 de la altura. En comederos "
            "automaticos, revisa la frecuencia de llenado.\n\n"
            "2. **Granulometria**: Particula demasiado fina (<0.5 mm) genera rechazo y desperdicio. "
            "Lo ideal es 60-70% de particulas entre 0.5-3.2 mm.\n\n"
            "3. **Consumo real vs formulado**: Verifica el consumo real pesando alimento entregado "
            "y sobrante. Registra en EGGlogU > Alimento > Consumo diario. Consumo tipico: "
            "105-120 g/ave/dia dependiendo de la linea y temperatura.\n\n"
            "4. **Roedores y aves silvestres**: Una rata consume 25-30 g/dia. 100 ratas = 2.5 kg/dia "
            "de perdida. Implementa programa de control de plagas.\n\n"
            "5. **Temperatura ambiental**: A >28C el consumo baja pero la eficiencia tambien. "
            "Debajo de 15C el consumo sube para mantenimiento termico. Ajusta la energia "
            "metabolizable de la dieta segun la estacion.\n\n"
            "6. **Salud intestinal**: Coccidiosis subclinica, disbacteriosis o enteritis necrotica "
            "reducen la absorcion. Evalua consistencia de las heces y pigmentacion de patas.\n\n"
            "En EGGlogU, el FCR se calcula automaticamente en Dashboard > KPIs cuando registras "
            "produccion y consumo de alimento diariamente."
        ),
        "content_en": (
            "FCR (Feed Conversion Ratio) in layers is measured as kg feed / kg egg produced. "
            "Optimal FCR is 2.0-2.2 for flocks at peak. If it exceeds 2.5, investigate:\n\n"
            "1. **Feed wastage**: Poorly adjusted feeders are the #1 cause. Feed level in trough "
            "feeders should not exceed 1/3 of the height. For automatic feeders, check "
            "fill frequency.\n\n"
            "2. **Particle size**: Too fine (<0.5 mm) causes rejection and waste. "
            "Ideal is 60-70% of particles between 0.5-3.2 mm.\n\n"
            "3. **Actual vs formulated intake**: Verify actual consumption by weighing feed "
            "delivered and remaining. Log in EGGlogU > Feed > Daily consumption. Typical intake: "
            "105-120 g/bird/day depending on strain and temperature.\n\n"
            "4. **Rodents and wild birds**: A rat consumes 25-30 g/day. 100 rats = 2.5 kg/day "
            "lost. Implement pest control program.\n\n"
            "5. **Ambient temperature**: Above 28C intake drops but so does efficiency. "
            "Below 15C intake rises for thermal maintenance. Adjust metabolizable energy "
            "in the diet according to season.\n\n"
            "6. **Gut health**: Subclinical coccidiosis, dysbiosis, or necrotic enteritis "
            "reduce absorption. Evaluate fecal consistency and shank pigmentation.\n\n"
            "In EGGlogU, FCR is automatically calculated in Dashboard > KPIs when you log "
            "production and feed consumption daily."
        ),
        "keywords": "fcr,conversion,alimento,feed,consumo,consumption,desperdicio,waste,eficiencia,efficiency",
        "sort_order": 50,
    },
    # ── 6. alimento — Transicion de alimento ──
    {
        "category": TicketCategory.alimento,
        "title_es": "Transicion de alimento: como cambiar sin afectar produccion",
        "title_en": "Feed transition: how to switch without affecting production",
        "content_es": (
            "Un cambio brusco de alimento es una de las causas mas comunes de caida de produccion. "
            "Sigue este protocolo de transicion gradual:\n\n"
            "**Programa de mezcla (7-10 dias):**\n"
            "- Dias 1-2: 75% alimento anterior + 25% alimento nuevo\n"
            "- Dias 3-4: 50% / 50%\n"
            "- Dias 5-6: 25% anterior + 75% nuevo\n"
            "- Dia 7+: 100% alimento nuevo\n\n"
            "**Cuando se transiciona:**\n"
            "- Pre-postura a postura: semana 16-17 (cuando el lote alcanza 5% de produccion)\n"
            "- Postura fase 1 a fase 2: cuando la produccion baja a 85-88%\n"
            "- Postura fase 2 a fase 3: cuando baja a 75-78%\n\n"
            "**Que monitorear durante la transicion:**\n"
            "- Consumo de alimento diario (deberia mantenerse estable +/-5%)\n"
            "- Produccion de huevo (tolerancia: caida <2% es normal)\n"
            "- Consistencia de heces (cambio de color o textura indica adaptacion digestiva)\n"
            "- Peso corporal (pesa una muestra de 30 aves/lote semanal)\n\n"
            "**Errores comunes:**\n"
            "- Cambiar alimento y vacunar el mismo dia (doble estres)\n"
            "- Transicionar durante un pico de calor\n"
            "- No registrar el cambio, dificultando analisis retroactivo\n\n"
            "Registra el cambio de alimento en EGGlogU > Alimento > Nuevo lote de alimento "
            "para que el sistema lo correlacione con cambios en produccion."
        ),
        "content_en": (
            "A sudden feed change is one of the most common causes of production drops. "
            "Follow this gradual transition protocol:\n\n"
            "**Mixing schedule (7-10 days):**\n"
            "- Days 1-2: 75% old feed + 25% new feed\n"
            "- Days 3-4: 50% / 50%\n"
            "- Days 5-6: 25% old + 75% new\n"
            "- Day 7+: 100% new feed\n\n"
            "**When to transition:**\n"
            "- Pre-lay to layer: week 16-17 (when flock reaches 5% production)\n"
            "- Layer phase 1 to phase 2: when production drops to 85-88%\n"
            "- Layer phase 2 to phase 3: when it drops to 75-78%\n\n"
            "**What to monitor during transition:**\n"
            "- Daily feed intake (should remain stable +/-5%)\n"
            "- Egg production (tolerance: <2% drop is normal)\n"
            "- Fecal consistency (color/texture change indicates digestive adaptation)\n"
            "- Body weight (weigh a sample of 30 birds/flock weekly)\n\n"
            "**Common mistakes:**\n"
            "- Changing feed and vaccinating the same day (double stress)\n"
            "- Transitioning during a heat wave\n"
            "- Not recording the change, making retroactive analysis difficult\n\n"
            "Record the feed change in EGGlogU > Feed > New feed batch "
            "so the system correlates it with production changes."
        ),
        "keywords": "transicion,transition,cambio,change,alimento,feed,mezcla,mix,fase,phase",
        "sort_order": 60,
    },
    # ── 7. iot — Sensor sin lectura ──
    {
        "category": TicketCategory.iot,
        "title_es": "Sensor sin lectura: diagnostico y solucion",
        "title_en": "Sensor not reading: diagnosis and fix",
        "content_es": (
            "Si un sensor IoT de EGGlogU no reporta datos, sigue esta guia de diagnostico:\n\n"
            "**1. Verifica conexion fisica:**\n"
            "- Comprueba que el LED de estado del sensor este encendido (verde = OK, rojo = error)\n"
            "- Revisa que el cable de alimentacion este firme y sin corrosion\n"
            "- En sensores inalambricos, verifica nivel de bateria (>20% para operacion confiable)\n\n"
            "**2. Conectividad de red:**\n"
            "- El sensor se comunica via MQTT al gateway local\n"
            "- Verifica que el gateway WiFi/Ethernet tenga conexion a internet\n"
            "- Reinicia el gateway: desconecta 10 segundos, reconecta\n"
            "- Comprueba que la distancia sensor-gateway no supere 30 m (sin obstaculos) o 15 m (con paredes)\n\n"
            "**3. En la app EGGlogU:**\n"
            "- Ve a IoT > Sensores > selecciona el sensor afectado\n"
            "- Verifica la 'Ultima lectura' — si tiene mas de 15 minutos, el sensor esta desconectado\n"
            "- Usa 'Diagnosticar sensor' para enviar un ping y ver la respuesta\n\n"
            "**4. Problemas comunes por tipo de sensor:**\n"
            "- **Temperatura/humedad (DHT22/SHT30):** Limpiar la rejilla de ventilacion, puede estar obstruida por polvo del galpon\n"
            "- **Amoniaco (MQ-137):** Requiere recalibracion cada 6 meses; el sensor tiene vida util de 2 anos\n"
            "- **Balanza de alimento:** Verifica que la celda de carga no este deformada y que la plataforma este nivelada\n\n"
            "**5. Si nada funciona:** Registra un ticket de soporte con el ID del sensor (visible en IoT > Sensores > Detalle)."
        ),
        "content_en": (
            "If an EGGlogU IoT sensor is not reporting data, follow this diagnostic guide:\n\n"
            "**1. Check physical connection:**\n"
            "- Verify the sensor status LED is on (green = OK, red = error)\n"
            "- Check that the power cable is secure and corrosion-free\n"
            "- For wireless sensors, verify battery level (>20% for reliable operation)\n\n"
            "**2. Network connectivity:**\n"
            "- The sensor communicates via MQTT to the local gateway\n"
            "- Verify the WiFi/Ethernet gateway has internet connection\n"
            "- Restart the gateway: disconnect for 10 seconds, reconnect\n"
            "- Check that sensor-gateway distance doesn't exceed 30 m (no obstacles) or 15 m (with walls)\n\n"
            "**3. In the EGGlogU app:**\n"
            "- Go to IoT > Sensors > select the affected sensor\n"
            "- Check 'Last reading' — if older than 15 minutes, the sensor is disconnected\n"
            "- Use 'Diagnose sensor' to send a ping and see the response\n\n"
            "**4. Common issues by sensor type:**\n"
            "- **Temperature/humidity (DHT22/SHT30):** Clean the ventilation grille, it may be clogged with house dust\n"
            "- **Ammonia (MQ-137):** Requires recalibration every 6 months; sensor has a 2-year lifespan\n"
            "- **Feed scale:** Verify the load cell is not deformed and the platform is level\n\n"
            "**5. If nothing works:** Submit a support ticket with the sensor ID (visible in IoT > Sensors > Detail)."
        ),
        "keywords": "sensor,iot,lectura,reading,mqtt,gateway,temperatura,temperature,humedad,humidity,amoniaco,ammonia",
        "sort_order": 70,
    },
    # ── 8. sync — Problemas offline ──
    {
        "category": TicketCategory.sync,
        "title_es": "Problemas de sincronizacion offline",
        "title_en": "Offline sync issues",
        "content_es": (
            "EGGlogU funciona offline-first: los datos se guardan en IndexedDB local y se "
            "sincronizan al servidor cuando hay conexion. Si la sincronizacion falla:\n\n"
            "**1. Verifica el estado de sync:**\n"
            "- En la app, busca el icono de sync en la barra superior\n"
            "- Verde con palomita = sincronizado\n"
            "- Amarillo con flechas = pendiente de sync\n"
            "- Rojo con X = error de sync\n\n"
            "**2. Sync pendiente pero con internet:**\n"
            "- Toca el icono de sync para forzar una sincronizacion manual\n"
            "- Si falla, revisa la cola de pendientes en Ajustes > Sync > Cola\n"
            "- Puede haber un registro con datos invalidos bloqueando la cola\n\n"
            "**3. Conflictos de sync:**\n"
            "- Si dos usuarios editaron el mismo registro offline, el sistema usa 'ultimo gana' (last-write-wins)\n"
            "- Los conflictos se registran en Ajustes > Sync > Historial de conflictos\n"
            "- Puedes ver la version anterior y restaurarla si es necesario\n\n"
            "**4. Datos locales no aparecen en el servidor:**\n"
            "- Verifica que estas logueado con la misma cuenta en ambos dispositivos\n"
            "- Si cambiaste de dispositivo, los datos locales del dispositivo anterior "
            "se sincronizan solo cuando ese dispositivo vuelva a conectarse\n\n"
            "**5. Resetear la sync (ultimo recurso):**\n"
            "- Ajustes > Sync > Forzar sync completa\n"
            "- Esto descarga todos los datos del servidor y reconcilia con los locales\n"
            "- NO borra datos locales no sincronizados\n\n"
            "**Importante:** Nunca borres los datos del navegador/app sin hacer sync primero."
        ),
        "content_en": (
            "EGGlogU works offline-first: data is saved in local IndexedDB and "
            "syncs to the server when connected. If sync fails:\n\n"
            "**1. Check sync status:**\n"
            "- In the app, look for the sync icon in the top bar\n"
            "- Green with checkmark = synced\n"
            "- Yellow with arrows = sync pending\n"
            "- Red with X = sync error\n\n"
            "**2. Sync pending but connected to internet:**\n"
            "- Tap the sync icon to force a manual sync\n"
            "- If it fails, check the pending queue in Settings > Sync > Queue\n"
            "- There may be a record with invalid data blocking the queue\n\n"
            "**3. Sync conflicts:**\n"
            "- If two users edited the same record offline, the system uses 'last-write-wins'\n"
            "- Conflicts are logged in Settings > Sync > Conflict history\n"
            "- You can view the previous version and restore it if needed\n\n"
            "**4. Local data not appearing on server:**\n"
            "- Verify you're logged in with the same account on both devices\n"
            "- If you switched devices, local data from the previous device "
            "syncs only when that device reconnects\n\n"
            "**5. Reset sync (last resort):**\n"
            "- Settings > Sync > Force full sync\n"
            "- This downloads all server data and reconciles with local data\n"
            "- Does NOT delete unsynced local data\n\n"
            "**Important:** Never clear browser/app data without syncing first."
        ),
        "keywords": "sync,sincronizar,offline,online,cola,queue,conflicto,conflict,pendiente,pending",
        "sort_order": 80,
    },
    # ── 9. sync — Backup de datos ──
    {
        "category": TicketCategory.sync,
        "title_es": "Backup y restauracion de datos",
        "title_en": "Data backup and restoration",
        "content_es": (
            "Tus datos de produccion son criticos. EGGlogU tiene multiples capas de backup:\n\n"
            "**Backup automatico (servidor):**\n"
            "- Los datos sincronizados se respaldan automaticamente cada 24 horas\n"
            "- Retencion: 30 dias (Starter), 90 dias (Pro), 365 dias (Enterprise)\n"
            "- Los backups se almacenan encriptados en una region geografica separada\n\n"
            "**Backup manual (desde la app):**\n"
            "- Ve a Ajustes > Datos > Exportar datos\n"
            "- Formatos disponibles: CSV (para Excel), JSON (backup completo)\n"
            "- El CSV incluye: registros diarios, mortalidad, alimento, produccion\n"
            "- El JSON incluye toda la configuracion de granjas, galpones y registros\n\n"
            "**Restaurar desde backup:**\n"
            "- Ajustes > Datos > Importar datos\n"
            "- Sube el archivo JSON de backup\n"
            "- El sistema combina los datos importados con los existentes (no sobreescribe)\n"
            "- Si hay duplicados, se conserva la version mas reciente\n\n"
            "**Mejores practicas:**\n"
            "- Exporta un CSV semanal como respaldo adicional\n"
            "- Guarda el JSON mensual en una ubicacion externa (USB, nube personal)\n"
            "- Antes de cualquier migracion o cambio de dispositivo, haz un backup JSON\n\n"
            "**Plan Hobby:** Backup manual solamente (CSV). Upgrade a Starter o superior "
            "para backups automaticos del servidor."
        ),
        "content_en": (
            "Your production data is critical. EGGlogU has multiple backup layers:\n\n"
            "**Automatic backup (server):**\n"
            "- Synced data is automatically backed up every 24 hours\n"
            "- Retention: 30 days (Starter), 90 days (Pro), 365 days (Enterprise)\n"
            "- Backups are stored encrypted in a separate geographic region\n\n"
            "**Manual backup (from the app):**\n"
            "- Go to Settings > Data > Export data\n"
            "- Available formats: CSV (for Excel), JSON (full backup)\n"
            "- CSV includes: daily records, mortality, feed, production\n"
            "- JSON includes all farm, house configuration, and records\n\n"
            "**Restore from backup:**\n"
            "- Settings > Data > Import data\n"
            "- Upload the JSON backup file\n"
            "- The system merges imported data with existing data (no overwrite)\n"
            "- If duplicates exist, the most recent version is kept\n\n"
            "**Best practices:**\n"
            "- Export a weekly CSV as additional backup\n"
            "- Save a monthly JSON to an external location (USB, personal cloud)\n"
            "- Before any migration or device change, do a JSON backup\n\n"
            "**Hobby plan:** Manual backup only (CSV). Upgrade to Starter or above "
            "for automatic server backups."
        ),
        "keywords": "backup,respaldo,restaurar,restore,exportar,export,importar,import,datos,data,csv,json",
        "sort_order": 90,
    },
    # ── 10. billing — Upgrade de plan ──
    {
        "category": TicketCategory.billing,
        "title_es": "Como hacer upgrade de plan",
        "title_en": "How to upgrade your plan",
        "content_es": (
            "Para cambiar a un plan superior en EGGlogU:\n\n"
            "**Desde la app:**\n"
            "1. Ve a Ajustes > Suscripcion > Cambiar plan\n"
            "2. Selecciona el nuevo plan (Starter $49/mes, Pro $99/mes, Enterprise $199/mes)\n"
            "3. Confirma el pago — se cobra la diferencia prorrateada del mes actual\n"
            "4. Las nuevas funcionalidades se activan inmediatamente\n\n"
            "**Que se desbloquea con cada plan:**\n"
            "- **Starter ($49/mes):** Hasta 5 granjas, 20 galpones, soporte por ticket (SLA 48h), "
            "backups automaticos 30 dias, exportacion CSV\n"
            "- **Pro ($99/mes):** Hasta 15 granjas, 100 galpones, soporte prioritario (SLA 12h), "
            "IoT integrado, reportes avanzados, backups 90 dias\n"
            "- **Enterprise ($199/mes):** Ilimitado, SLA 4h, API personalizada, "
            "soporte dedicado, backups 365 dias, SSO\n\n"
            "**Facturacion:**\n"
            "- El cobro es mensual via Stripe (tarjeta de credito/debito)\n"
            "- Puedes cambiar tu metodo de pago en Ajustes > Suscripcion > Metodo de pago\n"
            "- Las facturas se envian por email y estan disponibles en Ajustes > Suscripcion > Facturas\n\n"
            "**Nota:** El upgrade es inmediato. El downgrade se aplica al inicio del siguiente ciclo de facturacion."
        ),
        "content_en": (
            "To upgrade to a higher plan in EGGlogU:\n\n"
            "**From the app:**\n"
            "1. Go to Settings > Subscription > Change plan\n"
            "2. Select the new plan (Starter $49/mo, Pro $99/mo, Enterprise $199/mo)\n"
            "3. Confirm payment — the prorated difference for the current month is charged\n"
            "4. New features activate immediately\n\n"
            "**What unlocks with each plan:**\n"
            "- **Starter ($49/mo):** Up to 5 farms, 20 houses, ticket support (SLA 48h), "
            "automatic backups 30 days, CSV export\n"
            "- **Pro ($99/mo):** Up to 15 farms, 100 houses, priority support (SLA 12h), "
            "IoT integration, advanced reports, backups 90 days\n"
            "- **Enterprise ($199/mo):** Unlimited, SLA 4h, custom API, "
            "dedicated support, backups 365 days, SSO\n\n"
            "**Billing:**\n"
            "- Charges are monthly via Stripe (credit/debit card)\n"
            "- You can change your payment method in Settings > Subscription > Payment method\n"
            "- Invoices are emailed and available in Settings > Subscription > Invoices\n\n"
            "**Note:** Upgrades are immediate. Downgrades take effect at the start of the next billing cycle."
        ),
        "keywords": "upgrade,plan,suscripcion,subscription,precio,price,starter,pro,enterprise,cambiar,change",
        "sort_order": 100,
    },
    # ── 11. billing — Cancelar suscripcion ──
    {
        "category": TicketCategory.billing,
        "title_es": "Como cancelar tu suscripcion",
        "title_en": "How to cancel your subscription",
        "content_es": (
            "Lamentamos que consideres cancelar. Antes, revisa si podemos ayudarte:\n\n"
            "**Si el problema es el precio:** Puedes hacer downgrade a Hobby ($19/mes) "
            "en vez de cancelar. Mantendras acceso basico a registro de datos.\n\n"
            "**Para cancelar:**\n"
            "1. Ve a Ajustes > Suscripcion > Cancelar suscripcion\n"
            "2. Selecciona el motivo de cancelacion (nos ayuda a mejorar)\n"
            "3. Confirma la cancelacion\n\n"
            "**Que pasa despues de cancelar:**\n"
            "- Tu plan actual permanece activo hasta el fin del ciclo de facturacion pagado\n"
            "- Despues, tu cuenta pasa a modo 'Suspendido'\n"
            "- En modo suspendido: solo lectura, no puedes crear nuevos registros\n"
            "- Tus datos se conservan por 90 dias\n"
            "- Despues de 90 dias, los datos se eliminan permanentemente\n\n"
            "**Antes de cancelar:**\n"
            "- Exporta tus datos: Ajustes > Datos > Exportar (CSV o JSON)\n"
            "- Descarga tus facturas: Ajustes > Suscripcion > Facturas\n\n"
            "**Reactivar:**\n"
            "- Dentro de los 90 dias, puedes reactivar desde Ajustes > Suscripcion > Reactivar\n"
            "- Todos tus datos se restauran al plan que elijas\n\n"
            "Si necesitas una pausa temporal en vez de cancelar, contacta a soporte — "
            "podemos congelar tu cuenta hasta por 3 meses."
        ),
        "content_en": (
            "We're sorry to see you consider canceling. First, check if we can help:\n\n"
            "**If price is the issue:** You can downgrade to Hobby ($19/mo) "
            "instead of canceling. You'll keep basic data logging access.\n\n"
            "**To cancel:**\n"
            "1. Go to Settings > Subscription > Cancel subscription\n"
            "2. Select the cancellation reason (helps us improve)\n"
            "3. Confirm cancellation\n\n"
            "**What happens after canceling:**\n"
            "- Your current plan remains active until the end of the paid billing cycle\n"
            "- After that, your account enters 'Suspended' mode\n"
            "- In suspended mode: read-only, you can't create new records\n"
            "- Your data is retained for 90 days\n"
            "- After 90 days, data is permanently deleted\n\n"
            "**Before canceling:**\n"
            "- Export your data: Settings > Data > Export (CSV or JSON)\n"
            "- Download your invoices: Settings > Subscription > Invoices\n\n"
            "**Reactivate:**\n"
            "- Within 90 days, you can reactivate from Settings > Subscription > Reactivate\n"
            "- All your data is restored to the plan you choose\n\n"
            "If you need a temporary pause instead of canceling, contact support — "
            "we can freeze your account for up to 3 months."
        ),
        "keywords": "cancelar,cancel,suscripcion,subscription,baja,desactivar,deactivate,reembolso,refund",
        "sort_order": 110,
    },
    # ── 12. tecnico — App no carga ──
    {
        "category": TicketCategory.bug,
        "title_es": "La app no carga: soluciones paso a paso",
        "title_en": "App won't load: step-by-step solutions",
        "content_es": (
            "Si EGGlogU no carga o muestra pantalla en blanco:\n\n"
            "**1. Verifica tu conexion (si no estas en modo offline):**\n"
            "- Abre otra pagina web para confirmar que tienes internet\n"
            "- Si usas datos moviles, verifica que no hayas agotado tu plan de datos\n\n"
            "**2. Limpia cache del navegador:**\n"
            "- Chrome: Configuracion > Privacidad > Borrar datos de navegacion > Solo 'Cache'\n"
            "- Safari: Ajustes > Safari > Borrar historial y datos\n"
            "- **NO borres 'Datos de sitios web'** — eso eliminara tus datos offline no sincronizados\n\n"
            "**3. Prueba en ventana de incognito:**\n"
            "- Si funciona en incognito, una extension del navegador esta interfiriendo\n"
            "- Deshabilita extensiones una por una (los ad-blockers son la causa mas comun)\n\n"
            "**4. Actualiza el Service Worker:**\n"
            "- Chrome: F12 > Application > Service Workers > 'Update on reload' activado\n"
            "- Recarga la pagina (Ctrl+Shift+R o Cmd+Shift+R)\n\n"
            "**5. Verifica requisitos del navegador:**\n"
            "- Chrome 90+, Firefox 90+, Safari 15+, Edge 90+\n"
            "- Debe tener JavaScript habilitado\n"
            "- IndexedDB debe estar disponible (bloqueado en modo privado de algunos navegadores)\n\n"
            "**6. Error persistente:**\n"
            "- Abre la consola del navegador (F12 > Console)\n"
            "- Toma captura de pantalla de cualquier error en rojo\n"
            "- Envia la captura en un ticket de soporte con tu navegador y version"
        ),
        "content_en": (
            "If EGGlogU won't load or shows a blank screen:\n\n"
            "**1. Check your connection (if not in offline mode):**\n"
            "- Open another web page to confirm you have internet\n"
            "- If using mobile data, verify you haven't exhausted your data plan\n\n"
            "**2. Clear browser cache:**\n"
            "- Chrome: Settings > Privacy > Clear browsing data > Only 'Cache'\n"
            "- Safari: Settings > Safari > Clear history and data\n"
            "- **Do NOT clear 'Site data'** — that will delete unsynced offline data\n\n"
            "**3. Try incognito window:**\n"
            "- If it works in incognito, a browser extension is interfering\n"
            "- Disable extensions one by one (ad-blockers are the most common cause)\n\n"
            "**4. Update Service Worker:**\n"
            "- Chrome: F12 > Application > Service Workers > Enable 'Update on reload'\n"
            "- Hard reload the page (Ctrl+Shift+R or Cmd+Shift+R)\n\n"
            "**5. Check browser requirements:**\n"
            "- Chrome 90+, Firefox 90+, Safari 15+, Edge 90+\n"
            "- JavaScript must be enabled\n"
            "- IndexedDB must be available (blocked in private mode on some browsers)\n\n"
            "**6. Persistent error:**\n"
            "- Open browser console (F12 > Console)\n"
            "- Screenshot any red errors\n"
            "- Submit the screenshot in a support ticket with your browser and version"
        ),
        "keywords": "cargar,load,blanco,blank,pantalla,screen,error,crash,no funciona,not working,cache",
        "sort_order": 120,
    },
    # ── 13. tecnico — Graficos no aparecen ──
    {
        "category": TicketCategory.bug,
        "title_es": "Los graficos no aparecen o se ven mal",
        "title_en": "Charts not showing or displaying incorrectly",
        "content_es": (
            "Si los graficos de produccion, mortalidad o alimento no se renderizan:\n\n"
            "**1. Datos insuficientes:**\n"
            "- Los graficos de tendencia necesitan al menos 3 dias de datos registrados\n"
            "- Los graficos comparativos necesitan al menos 2 lotes con datos\n"
            "- Verifica que los registros estan para el galpon y rango de fechas seleccionado\n\n"
            "**2. Rango de fechas:**\n"
            "- Verifica que el rango de fechas seleccionado contiene datos\n"
            "- Si seleccionas 'Esta semana' pero hoy es lunes y no has registrado, estara vacio\n"
            "- Prueba con 'Ultimo mes' para confirmar que los datos existen\n\n"
            "**3. Filtros activos:**\n"
            "- Revisa que no tengas un filtro de granja o galpon que excluya los datos\n"
            "- El boton 'Limpiar filtros' restablece todos los criterios\n\n"
            "**4. Navegador desactualizado:**\n"
            "- Los graficos usan Canvas/SVG que requieren navegadores modernos\n"
            "- Actualiza tu navegador a la ultima version disponible\n"
            "- En dispositivos Android viejos (< Android 8), el rendimiento puede ser limitado\n\n"
            "**5. Modo offline:**\n"
            "- Los graficos funcionan offline con los datos almacenados localmente\n"
            "- Si sincronizaste recientemente en otro dispositivo, los datos nuevos "
            "pueden no estar aun en el dispositivo actual\n\n"
            "**6. Memoria del dispositivo:**\n"
            "- Si tienes muchos lotes (+50,000 registros), el navegador puede quedarse sin memoria\n"
            "- Reduce el rango de fechas o selecciona un solo galpon"
        ),
        "content_en": (
            "If production, mortality, or feed charts are not rendering:\n\n"
            "**1. Insufficient data:**\n"
            "- Trend charts need at least 3 days of logged data\n"
            "- Comparative charts need at least 2 flocks with data\n"
            "- Verify records exist for the selected house and date range\n\n"
            "**2. Date range:**\n"
            "- Verify the selected date range contains data\n"
            "- If you select 'This week' but today is Monday and you haven't logged, it'll be empty\n"
            "- Try 'Last month' to confirm data exists\n\n"
            "**3. Active filters:**\n"
            "- Check that you don't have a farm or house filter excluding the data\n"
            "- The 'Clear filters' button resets all criteria\n\n"
            "**4. Outdated browser:**\n"
            "- Charts use Canvas/SVG which require modern browsers\n"
            "- Update your browser to the latest available version\n"
            "- On older Android devices (< Android 8), performance may be limited\n\n"
            "**5. Offline mode:**\n"
            "- Charts work offline with locally stored data\n"
            "- If you recently synced on another device, new data "
            "may not yet be on the current device\n\n"
            "**6. Device memory:**\n"
            "- If you have many flocks (+50,000 records), the browser may run out of memory\n"
            "- Reduce the date range or select a single house"
        ),
        "keywords": "grafico,chart,graph,no aparece,not showing,produccion,production,tendencia,trend,vacio,empty",
        "sort_order": 130,
    },
    # ── 14. cuenta — Reset password ──
    {
        "category": TicketCategory.acceso,
        "title_es": "Como restablecer tu contrasena",
        "title_en": "How to reset your password",
        "content_es": (
            "Si olvidaste tu contrasena o necesitas cambiarla:\n\n"
            "**Opcion 1 — Desde la pantalla de login:**\n"
            "1. Toca 'Olvide mi contrasena'\n"
            "2. Ingresa el email asociado a tu cuenta\n"
            "3. Recibiras un correo con un enlace de restablecimiento (valido por 1 hora)\n"
            "4. Abre el enlace y crea una nueva contrasena\n\n"
            "**Opcion 2 — Desde dentro de la app (si ya estas logueado):**\n"
            "1. Ve a Ajustes > Cuenta > Cambiar contrasena\n"
            "2. Ingresa tu contrasena actual\n"
            "3. Ingresa y confirma la nueva contrasena\n\n"
            "**Requisitos de contrasena:**\n"
            "- Minimo 8 caracteres\n"
            "- Al menos 1 mayuscula, 1 minuscula y 1 numero\n"
            "- No puede ser igual a las ultimas 3 contrasenas usadas\n\n"
            "**No recibes el correo de restablecimiento:**\n"
            "- Revisa la carpeta de Spam/Correo no deseado\n"
            "- Verifica que el email es el correcto (el que usaste al registrarte)\n"
            "- Si usaste Google OAuth para registrarte, no tienes contrasena de EGGlogU — "
            "usa 'Iniciar sesion con Google' directamente\n"
            "- Espera hasta 5 minutos antes de solicitar otro enlace\n\n"
            "**PIN offline:** Si usas PIN para acceso offline, este es independiente de la "
            "contrasena. Puedes cambiarlo en Ajustes > Seguridad > PIN offline."
        ),
        "content_en": (
            "If you forgot your password or need to change it:\n\n"
            "**Option 1 — From the login screen:**\n"
            "1. Tap 'Forgot my password'\n"
            "2. Enter the email associated with your account\n"
            "3. You'll receive an email with a reset link (valid for 1 hour)\n"
            "4. Open the link and create a new password\n\n"
            "**Option 2 — From within the app (if already logged in):**\n"
            "1. Go to Settings > Account > Change password\n"
            "2. Enter your current password\n"
            "3. Enter and confirm the new password\n\n"
            "**Password requirements:**\n"
            "- Minimum 8 characters\n"
            "- At least 1 uppercase, 1 lowercase, and 1 number\n"
            "- Cannot be the same as the last 3 passwords used\n\n"
            "**Not receiving the reset email:**\n"
            "- Check your Spam/Junk folder\n"
            "- Verify the email is correct (the one you used to register)\n"
            "- If you used Google OAuth to register, you don't have an EGGlogU password — "
            "use 'Sign in with Google' directly\n"
            "- Wait up to 5 minutes before requesting another link\n\n"
            "**Offline PIN:** If you use a PIN for offline access, it's independent of your "
            "password. You can change it in Settings > Security > Offline PIN."
        ),
        "keywords": "password,contrasena,reset,restablecer,olvide,forgot,login,acceso,access,pin",
        "sort_order": 140,
    },
    # ── 15. cuenta — Agregar usuario ──
    {
        "category": TicketCategory.acceso,
        "title_es": "Como agregar usuarios a tu organizacion",
        "title_en": "How to add users to your organization",
        "content_es": (
            "Los duenos y gerentes pueden invitar nuevos usuarios a la organizacion:\n\n"
            "**Pasos para invitar:**\n"
            "1. Ve a Ajustes > Organizacion > Usuarios\n"
            "2. Toca 'Invitar usuario'\n"
            "3. Ingresa el email del nuevo usuario\n"
            "4. Selecciona el rol:\n"
            "   - **Capturista:** Solo puede registrar datos diarios y ver su galpon asignado\n"
            "   - **Supervisor:** Ve y edita datos de todas las granjas, acceso a reportes\n"
            "   - **Gerente:** Todo lo anterior + gestion de usuarios y configuracion\n"
            "   - **Dueno:** Acceso total incluyendo facturacion\n"
            "5. Asigna las granjas/galpones a los que tendra acceso\n"
            "6. Toca 'Enviar invitacion'\n\n"
            "**El usuario invitado:**\n"
            "- Recibe un email con enlace de invitacion (valido por 72 horas)\n"
            "- Si ya tiene cuenta EGGlogU, se agrega automaticamente a tu organizacion\n"
            "- Si es nuevo, debe crear cuenta y se vincula al aceptar la invitacion\n\n"
            "**Limites por plan:**\n"
            "- Hobby: 2 usuarios\n"
            "- Starter: 10 usuarios\n"
            "- Pro: 50 usuarios\n"
            "- Enterprise: Ilimitado\n\n"
            "**Remover un usuario:**\n"
            "- Ajustes > Organizacion > Usuarios > seleccionar > Remover\n"
            "- El usuario pierde acceso inmediatamente pero sus registros se conservan\n\n"
            "**Seguridad:** Revisa la lista de usuarios periodicamente y remueve cuentas inactivas."
        ),
        "content_en": (
            "Owners and managers can invite new users to the organization:\n\n"
            "**Steps to invite:**\n"
            "1. Go to Settings > Organization > Users\n"
            "2. Tap 'Invite user'\n"
            "3. Enter the new user's email\n"
            "4. Select the role:\n"
            "   - **Data entry:** Can only log daily data and view their assigned house\n"
            "   - **Supervisor:** Views and edits data for all farms, report access\n"
            "   - **Manager:** All the above + user management and configuration\n"
            "   - **Owner:** Full access including billing\n"
            "5. Assign the farms/houses they'll have access to\n"
            "6. Tap 'Send invitation'\n\n"
            "**The invited user:**\n"
            "- Receives an email with invitation link (valid for 72 hours)\n"
            "- If they already have an EGGlogU account, they're automatically added to your org\n"
            "- If new, they must create an account and are linked upon accepting\n\n"
            "**Limits by plan:**\n"
            "- Hobby: 2 users\n"
            "- Starter: 10 users\n"
            "- Pro: 50 users\n"
            "- Enterprise: Unlimited\n\n"
            "**Remove a user:**\n"
            "- Settings > Organization > Users > select > Remove\n"
            "- The user loses access immediately but their records are preserved\n\n"
            "**Security:** Review the user list periodically and remove inactive accounts."
        ),
        "keywords": "usuario,user,agregar,add,invitar,invite,rol,role,organizacion,organization,permiso,permission",
        "sort_order": 150,
    },
]

# ═══════════════════════════════════════════════════════════════════
# AUTO-RESPONSE TEMPLATES — 10 category-specific auto-responses
# ═══════════════════════════════════════════════════════════════════

AUTO_RESPONSES: list[dict] = [
    # ── produccion ──
    {
        "category": TicketCategory.produccion,
        "trigger_keywords": "produccion,production,huevos,eggs,postura,laying,cascara,shell,calidad,quality",
        "response_es": (
            "Hemos recibido tu consulta sobre produccion. Mientras nuestro equipo la revisa, "
            "prueba estos pasos:\n\n"
            "1. Verifica el programa de luz: las gallinas necesitan 16 horas totales de luz (natural + artificial). "
            "Revisa que los temporizadores esten funcionando correctamente.\n"
            "2. Revisa el ultimo cambio de alimento en EGGlogU > Alimento. Un cambio reciente puede causar "
            "caidas temporales de 7-14 dias.\n"
            "3. Compara tu curva de produccion con la estandar de tu linea genetica en Dashboard > Graficos.\n\n"
            "Nuestro equipo de soporte revisara tu caso y respondera segun el SLA de tu plan. "
            "Consulta tambien nuestra seccion de FAQ para respuestas inmediatas."
        ),
        "response_en": (
            "We've received your production inquiry. While our team reviews it, "
            "try these steps:\n\n"
            "1. Check the lighting program: hens need 16 total hours of light (natural + artificial). "
            "Verify your timers are working correctly.\n"
            "2. Review the last feed change in EGGlogU > Feed. A recent change can cause "
            "temporary drops for 7-14 days.\n"
            "3. Compare your production curve against your genetic line's standard in Dashboard > Charts.\n\n"
            "Our support team will review your case and respond according to your plan's SLA. "
            "Also check our FAQ section for immediate answers."
        ),
        "sort_order": 10,
    },
    # ── sanidad ──
    {
        "category": TicketCategory.sanidad,
        "trigger_keywords": "vacuna,vaccine,enfermedad,disease,mortalidad,mortality,brote,outbreak,veterinario,vet",
        "response_es": (
            "Hemos recibido tu consulta de sanidad. Los temas de salud animal son prioritarios. "
            "Mientras un especialista revisa tu caso:\n\n"
            "1. Si hay mortalidad elevada (>0.1% diario), aisla el lote afectado inmediatamente y "
            "realiza una necropsia de campo en 3-5 aves recien muertas.\n"
            "2. Administra electrolitos + vitaminas en el agua de bebida como medida de soporte.\n"
            "3. Documenta todos los sintomas con fotos y registra la mortalidad diaria en EGGlogU.\n\n"
            "IMPORTANTE: Si sospechas de una enfermedad de reporte obligatorio (Influenza Aviar, Newcastle velogénico), "
            "notifica a las autoridades sanitarias de tu pais de inmediato.\n\n"
            "Nuestro equipo dara prioridad a tu caso. Tiempo de respuesta segun tu plan."
        ),
        "response_en": (
            "We've received your health inquiry. Animal health issues are a priority. "
            "While a specialist reviews your case:\n\n"
            "1. If mortality is elevated (>0.1% daily), isolate the affected flock immediately and "
            "perform a field necropsy on 3-5 freshly dead birds.\n"
            "2. Administer electrolytes + vitamins in drinking water as supportive care.\n"
            "3. Document all symptoms with photos and log daily mortality in EGGlogU.\n\n"
            "IMPORTANT: If you suspect a reportable disease (Avian Influenza, velogenic Newcastle), "
            "notify your country's animal health authorities immediately.\n\n"
            "Our team will prioritize your case. Response time according to your plan."
        ),
        "sort_order": 20,
    },
    # ── alimento ──
    {
        "category": TicketCategory.alimento,
        "trigger_keywords": "alimento,feed,fcr,conversion,consumo,consumption,nutricion,nutrition,transicion",
        "response_es": (
            "Hemos recibido tu consulta sobre alimentacion. Mientras nuestro equipo la analiza:\n\n"
            "1. Verifica el consumo real de alimento pesando lo entregado vs lo sobrante. Registra "
            "el dato diario en EGGlogU > Alimento > Consumo.\n"
            "2. Revisa la granulometria del alimento: particulas demasiado finas (<0.5 mm) causan "
            "rechazo y desperdicio. Lo ideal es 60-70% entre 0.5-3.2 mm.\n"
            "3. Si cambiaste proveedor o formula, sigue un protocolo de transicion gradual de 7-10 dias.\n\n"
            "El FCR y otros KPIs nutricionales se calculan automaticamente cuando registras "
            "produccion y alimento diariamente. Revisa Dashboard > KPIs.\n\n"
            "Nuestro equipo respondera segun el SLA de tu plan."
        ),
        "response_en": (
            "We've received your feed inquiry. While our team analyzes it:\n\n"
            "1. Verify actual feed consumption by weighing delivered vs remaining. Log "
            "the daily data in EGGlogU > Feed > Consumption.\n"
            "2. Check feed particle size: particles too fine (<0.5 mm) cause "
            "rejection and waste. Ideal is 60-70% between 0.5-3.2 mm.\n"
            "3. If you changed supplier or formula, follow a gradual transition protocol of 7-10 days.\n\n"
            "FCR and other nutritional KPIs are automatically calculated when you log "
            "production and feed daily. Check Dashboard > KPIs.\n\n"
            "Our team will respond according to your plan's SLA."
        ),
        "sort_order": 30,
    },
    # ── iot ──
    {
        "category": TicketCategory.iot,
        "trigger_keywords": "sensor,mqtt,iot,temperatura,temperature,humedad,humidity,amoniaco,ammonia,lectura,reading,gateway",
        "response_es": (
            "Hemos recibido tu consulta sobre sensores IoT. Para resolver rapidamente:\n\n"
            "1. Verifica que el LED de estado del sensor este encendido (verde = OK). Si esta apagado, "
            "revisa la alimentacion electrica y el cable.\n"
            "2. Reinicia el gateway: desconecta por 10 segundos y reconecta. Espera 2 minutos para "
            "que los sensores se reconecten.\n"
            "3. En la app, ve a IoT > Sensores y verifica la 'Ultima lectura'. Si tiene mas de 15 "
            "minutos, usa el boton 'Diagnosticar' para enviar un ping.\n\n"
            "Si el problema persiste, incluye el ID del sensor (IoT > Sensores > Detalle) en tu "
            "siguiente mensaje para que nuestro equipo tecnico pueda diagnosticar remotamente.\n\n"
            "Tiempo de respuesta segun tu plan."
        ),
        "response_en": (
            "We've received your IoT sensor inquiry. For quick resolution:\n\n"
            "1. Check that the sensor status LED is on (green = OK). If off, "
            "check the power supply and cable.\n"
            "2. Restart the gateway: disconnect for 10 seconds and reconnect. Wait 2 minutes for "
            "sensors to reconnect.\n"
            "3. In the app, go to IoT > Sensors and check 'Last reading'. If older than 15 "
            "minutes, use the 'Diagnose' button to send a ping.\n\n"
            "If the issue persists, include the sensor ID (IoT > Sensors > Detail) in your "
            "next message so our technical team can diagnose remotely.\n\n"
            "Response time according to your plan."
        ),
        "sort_order": 40,
    },
    # ── billing ──
    {
        "category": TicketCategory.billing,
        "trigger_keywords": "plan,pago,payment,factura,invoice,suscripcion,subscription,upgrade,cobro,charge,precio,price,cancelar,cancel",
        "response_es": (
            "Hemos recibido tu consulta de facturacion. Mientras nuestro equipo la revisa:\n\n"
            "1. Puedes ver tu plan actual y facturas en Ajustes > Suscripcion.\n"
            "2. Para cambiar de plan: Ajustes > Suscripcion > Cambiar plan. Los upgrades son "
            "inmediatos; los downgrades se aplican al siguiente ciclo.\n"
            "3. Para actualizar tu metodo de pago: Ajustes > Suscripcion > Metodo de pago.\n\n"
            "Si tu consulta es sobre un cobro incorrecto, por favor incluye el numero de factura "
            "o la fecha del cobro para agilizar la investigacion.\n\n"
            "Las consultas de facturacion se atienden en horario laboral (lunes a viernes, 9am-6pm). "
            "Nuestro equipo respondera dentro del SLA de tu plan."
        ),
        "response_en": (
            "We've received your billing inquiry. While our team reviews it:\n\n"
            "1. You can view your current plan and invoices in Settings > Subscription.\n"
            "2. To change plans: Settings > Subscription > Change plan. Upgrades are "
            "immediate; downgrades apply at the next billing cycle.\n"
            "3. To update your payment method: Settings > Subscription > Payment method.\n\n"
            "If your inquiry is about an incorrect charge, please include the invoice number "
            "or charge date to speed up the investigation.\n\n"
            "Billing inquiries are handled during business hours (Monday-Friday, 9am-6pm). "
            "Our team will respond within your plan's SLA."
        ),
        "sort_order": 50,
    },
    # ── bug ──
    {
        "category": TicketCategory.bug,
        "trigger_keywords": "bug,error,crash,falla,fail,no funciona,not working,pantalla,screen,blank,blanco",
        "response_es": (
            "Hemos recibido tu reporte de error. Para ayudarnos a diagnosticarlo mas rapido:\n\n"
            "1. Intenta recargar la app con Ctrl+Shift+R (o Cmd+Shift+R en Mac) para forzar "
            "una actualizacion del cache.\n"
            "2. Prueba en una ventana de incognito — si funciona ahi, una extension del navegador "
            "puede estar interfiriendo (desactiva ad-blockers primero).\n"
            "3. Abre la consola del navegador (F12 > Console), toma captura de pantalla de "
            "cualquier error en rojo y adjuntala a este ticket.\n\n"
            "Informacion util para incluir: navegador y version, dispositivo, sistema operativo, "
            "y los pasos exactos para reproducir el error.\n\n"
            "Nuestro equipo tecnico investigara el problema. Tiempo de respuesta segun tu plan."
        ),
        "response_en": (
            "We've received your bug report. To help us diagnose it faster:\n\n"
            "1. Try reloading the app with Ctrl+Shift+R (or Cmd+Shift+R on Mac) to force "
            "a cache update.\n"
            "2. Try an incognito window — if it works there, a browser extension "
            "may be interfering (disable ad-blockers first).\n"
            "3. Open the browser console (F12 > Console), screenshot any "
            "red errors, and attach them to this ticket.\n\n"
            "Useful information to include: browser and version, device, operating system, "
            "and the exact steps to reproduce the error.\n\n"
            "Our technical team will investigate the issue. Response time according to your plan."
        ),
        "sort_order": 60,
    },
    # ── sync ──
    {
        "category": TicketCategory.sync,
        "trigger_keywords": "sync,sincronizar,offline,datos,data,backup,restaurar,restore,perdido,lost,cola,queue",
        "response_es": (
            "Hemos recibido tu consulta sobre sincronizacion. Antes de que nuestro equipo intervenga:\n\n"
            "1. Verifica el estado de sync: busca el icono en la barra superior (verde = OK, "
            "amarillo = pendiente, rojo = error).\n"
            "2. Toca el icono de sync para forzar una sincronizacion manual.\n"
            "3. Si hay error, revisa la cola de pendientes en Ajustes > Sync > Cola — puede haber "
            "un registro con datos invalidos bloqueando la cola.\n\n"
            "IMPORTANTE: No borres los datos del navegador ni reinstales la app sin sincronizar "
            "primero. Los datos offline no sincronizados se perderian permanentemente.\n\n"
            "Nuestro equipo respondera segun el SLA de tu plan."
        ),
        "response_en": (
            "We've received your sync inquiry. Before our team steps in:\n\n"
            "1. Check sync status: look for the icon in the top bar (green = OK, "
            "yellow = pending, red = error).\n"
            "2. Tap the sync icon to force a manual sync.\n"
            "3. If there's an error, check the pending queue in Settings > Sync > Queue — there may be "
            "a record with invalid data blocking the queue.\n\n"
            "IMPORTANT: Do not clear browser data or reinstall the app without syncing "
            "first. Unsynced offline data would be permanently lost.\n\n"
            "Our team will respond according to your plan's SLA."
        ),
        "sort_order": 70,
    },
    # ── feature_request ──
    {
        "category": TicketCategory.feature_request,
        "trigger_keywords": "feature,funcionalidad,sugerencia,suggestion,solicitud,request,mejorar,improve,agregar,add",
        "response_es": (
            "Gracias por tu sugerencia. Valoramos mucho el feedback de nuestros usuarios para "
            "mejorar EGGlogU.\n\n"
            "Tu solicitud ha sido registrada y sera evaluada por nuestro equipo de producto. "
            "Asi funciona el proceso:\n\n"
            "1. Revisamos la viabilidad tecnica y el impacto para la comunidad de usuarios.\n"
            "2. Las funcionalidades mas solicitadas se priorizan en nuestro roadmap.\n"
            "3. Si tu sugerencia se incluye en una actualizacion, te notificaremos por email.\n\n"
            "Mientras tanto, verifica si la funcionalidad ya existe en una seccion diferente de la app — "
            "a veces lo que necesitas ya esta disponible. Consulta nuestra FAQ para mas detalles.\n\n"
            "No prometemos plazos especificos para nuevas funcionalidades, pero cada sugerencia cuenta."
        ),
        "response_en": (
            "Thank you for your suggestion. We greatly value user feedback to "
            "improve EGGlogU.\n\n"
            "Your request has been logged and will be evaluated by our product team. "
            "Here's how the process works:\n\n"
            "1. We review technical feasibility and impact for the user community.\n"
            "2. The most requested features are prioritized in our roadmap.\n"
            "3. If your suggestion is included in an update, we'll notify you by email.\n\n"
            "In the meantime, check if the feature already exists in a different section of the app — "
            "sometimes what you need is already available. Check our FAQ for more details.\n\n"
            "We don't promise specific timelines for new features, but every suggestion counts."
        ),
        "sort_order": 80,
    },
    # ── acceso ──
    {
        "category": TicketCategory.acceso,
        "trigger_keywords": "password,contraseña,login,acceso,access,cuenta,account,verificar,verify,email,google,pin",
        "response_es": (
            "Hemos recibido tu consulta de acceso. Prueba estos pasos:\n\n"
            "1. Si olvidaste tu contrasena: desde la pantalla de login, toca 'Olvide mi contrasena' "
            "y sigue las instrucciones. El enlace de restablecimiento es valido por 1 hora.\n"
            "2. Si usaste Google OAuth para registrarte, no tienes contrasena de EGGlogU — usa "
            "'Iniciar sesion con Google' directamente.\n"
            "3. Revisa que no tengas Caps Lock activado y que el email sea el correcto.\n\n"
            "Si necesitas cambiar el email de tu cuenta o tienes problemas con la verificacion, "
            "nuestro equipo necesitara confirmar tu identidad por seguridad.\n\n"
            "Tiempo de respuesta segun tu plan."
        ),
        "response_en": (
            "We've received your access inquiry. Try these steps:\n\n"
            "1. If you forgot your password: from the login screen, tap 'Forgot my password' "
            "and follow the instructions. The reset link is valid for 1 hour.\n"
            "2. If you used Google OAuth to register, you don't have an EGGlogU password — use "
            "'Sign in with Google' directly.\n"
            "3. Check that Caps Lock is not on and the email is correct.\n\n"
            "If you need to change your account email or have verification issues, "
            "our team will need to verify your identity for security.\n\n"
            "Response time according to your plan."
        ),
        "sort_order": 90,
    },
    # ── general ──
    {
        "category": TicketCategory.general,
        "trigger_keywords": "",
        "response_es": (
            "Hemos recibido tu mensaje. Nuestro equipo de soporte lo revisara pronto.\n\n"
            "Mientras tanto, te sugerimos:\n\n"
            "1. Consulta nuestra seccion de FAQ — muchas preguntas frecuentes ya tienen "
            "respuesta detallada con pasos de solucion.\n"
            "2. Si tu consulta es urgente (mortalidad elevada, perdida de datos), menciona "
            "'URGENTE' en el asunto para que reciba prioridad.\n"
            "3. Cuanta mas informacion nos proporciones (capturas de pantalla, pasos para "
            "reproducir el problema, granja/galpon afectado), mas rapido podremos ayudarte.\n\n"
            "Tiempo de respuesta estimado segun tu plan:\n"
            "- Starter: 48 horas\n"
            "- Pro: 12 horas\n"
            "- Enterprise: 4 horas\n\n"
            "Gracias por usar EGGlogU."
        ),
        "response_en": (
            "We've received your message. Our support team will review it shortly.\n\n"
            "In the meantime, we suggest:\n\n"
            "1. Check our FAQ section — many common questions already have "
            "detailed answers with solution steps.\n"
            "2. If your inquiry is urgent (elevated mortality, data loss), mention "
            "'URGENT' in the subject for priority handling.\n"
            "3. The more information you provide (screenshots, steps to reproduce "
            "the issue, affected farm/house), the faster we can help.\n\n"
            "Estimated response time based on your plan:\n"
            "- Starter: 48 hours\n"
            "- Pro: 12 hours\n"
            "- Enterprise: 4 hours\n\n"
            "Thank you for using EGGlogU."
        ),
        "sort_order": 100,
    },
]


# ═══════════════════════════════════════════════════════════════════
# SEED FUNCTION
# ═══════════════════════════════════════════════════════════════════


async def seed_support() -> dict[str, int]:
    """
    Insert FAQ articles and auto-response templates.
    Idempotent: skips if data already exists for each table.
    Returns counts of inserted rows.
    """
    inserted = {"faq_articles": 0, "auto_responses": 0}

    async with async_session() as session:
        async with session.begin():
            # ── Check existing FAQ articles ──
            faq_count = (
                await session.execute(select(func.count()).select_from(FAQArticle))
            ).scalar() or 0

            if faq_count == 0:
                for data in FAQ_ARTICLES:
                    faq = FAQArticle(
                        category=data["category"],
                        title_es=data["title_es"],
                        title_en=data["title_en"],
                        content_es=data["content_es"],
                        content_en=data["content_en"],
                        keywords=data["keywords"],
                        is_published=True,
                        sort_order=data["sort_order"],
                    )
                    session.add(faq)
                    inserted["faq_articles"] += 1
                logger.info("Inserted %d FAQ articles", inserted["faq_articles"])
            else:
                logger.info("Skipping FAQ seed — %d articles already exist", faq_count)

            # ── Check existing auto-responses ──
            ar_count = (
                await session.execute(select(func.count()).select_from(AutoResponse))
            ).scalar() or 0

            if ar_count == 0:
                for data in AUTO_RESPONSES:
                    ar = AutoResponse(
                        category=data["category"],
                        trigger_keywords=data["trigger_keywords"],
                        response_es=data["response_es"],
                        response_en=data["response_en"],
                        is_active=True,
                        sort_order=data["sort_order"],
                    )
                    session.add(ar)
                    inserted["auto_responses"] += 1
                logger.info("Inserted %d auto-responses", inserted["auto_responses"])
            else:
                logger.info(
                    "Skipping auto-response seed — %d responses already exist", ar_count
                )

    return inserted


# ═══════════════════════════════════════════════════════════════════
# CLI ENTRYPOINT
# ═══════════════════════════════════════════════════════════════════


async def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    logger.info("Seeding EGGlogU support data...")
    result = await seed_support()
    logger.info(
        "Done. Inserted: %d FAQ articles, %d auto-responses",
        result["faq_articles"],
        result["auto_responses"],
    )


if __name__ == "__main__":
    asyncio.run(main())
