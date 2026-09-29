# Trofeos

**No hay ningún fichero de trofeo en el juego.** Las copas se dibujan por
código, en `src/renderer/src/features/trophies/trophy-models.ts`: geometría de
revolución (`LatheGeometry`), aros (`TorusGeometry`), cajas y esferas, con un
material metálico. Siete siluetas, una por tipo de título, y el metal por
categoría (ver `src/shared/domain/trophies.ts`):

| Título                              | Forma                              | Metal                    |
| ----------------------------------- | ---------------------------------- | ------------------------ |
| Liga de primera / de segunda        | Copa alta de dos asas              | Oro / bronce             |
| Campeón de la liga americana        | Cáliz alto con tres aros           | Oro                      |
| Copa nacional                       | Copa baja de dos asas              | Plata                    |
| Continental (1.º, 2.º y 3.er nivel) | Boca muy abierta                   | Platino / plata / bronce |
| Mundial                             | Esfera de meridianos sobre columna | Oro                      |
| Ascenso                             | Placa sobre atril                  | Bronce                   |
| Premios individuales (gala)         | Estatuilla con balón               | Oro                      |

Esta carpeta existe para dejar dicho **por qué** (decisión del usuario,
2026-09-29), lo mismo que se decidió en DerbiManager:

- **Nada que se parezca a un trofeo real.** El trofeo de la NBA, la copa de la
  Euroliga o el trofeo del Mundial son diseños con dueño. Las galerías de
  modelos 3D (Sketchfab, Poly Pizza, Meshy) están llenas de réplicas de esos
  trofeos, y meterlas devolvería por la puerta de atrás el problema de marcas
  que el dataset ficticio del juego resolvió. Las formas de aquí se eligieron
  para no parecerse a ninguno: el Mundial no es una figura sujetando el mundo,
  la liga americana no lleva balón encima.
- **Ninguna licencia que mantener.** Casi nada de lo que se puede descargar es
  CC0; lo demás obliga a atribuir mientras el juego esté a la venta.
- **Cero peso.** Unas trescientas líneas, sin ficheros que empaquetar en el
  instalador.

La vitrina no abre un contexto de WebGL por copa: cada tipo se dibuja **una
sola vez** en un lienzo compartido y se guarda como imagen en memoria
(`trophy-thumbnail.ts`). Sin WebGL, se ve el trofeo plano del kit
(`TrophyIcon`) en el mismo metal.

Si algún día se quieren modelos de verdad, el punto de entrada es uno:
`buildTrophyFor(kind)` decide qué copa se levanta.
