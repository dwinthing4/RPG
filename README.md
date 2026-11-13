# Ashen Banners

A dark-fantasy tactics RPG where every image (characters, battlefields, the camp hub, the world map, UI textures, ability icons and spell effects) was generated locally with **Z-Image** in ComfyUI. Every character is auto-rigged from **OpenPose** keypoints.

## Play

```
npm install
npm run dev        # http://localhost:5190
```

Or double-click **Play Ashen Banners.bat**: it starts the game server and opens the game. If the server is already running in another window, it only opens the game.

**Saving:**
- The game saves itself: after every change at camp and at the start of every turn in battle.
- Saves go to the **`saves/`** folder in the project (written by the game's own server, `vite.saves.js`), with a copy in the browser's storage:
  - `saves/campaign.json`: your company, gold, items, progress, and the battle in progress.
  - `saves/characters/<id>.json`: your own characters, and built-ins drawn from your pictures.
  - `saves/tweaks/<id>.json`: Rig Studio edits (rig settings, clips, body, jiggle, names).
- Closing the tab, the browser or the command window loses nothing. On start, the newer of the disk copy and the browser copy wins, and the other catches up.
- `saves/backups/` keeps a rolling copy of the campaign about every five minutes (the last 30). Every save file also keeps its previous version as `.bak`.
- **A battle left mid-fight** (tab closed, reload, server stopped) resumes at the start of the turn it was on. The title screen offers **Continue the battle**. Sounding the **Retreat** is still a retreat: the fallen are hurt and a day passes.
- Automated test browsers never touch these files; they use `saves/slots/<name>/` when a test asks for it.

- **Title:** Begin the Campaign, or open the Rig Studio.
- **The Waystation (hub):**
  - War Table: contracts.
  - Campfire: company, party and recruits.
  - Forge: weapon and armour tiers.
  - Quartermaster: potions and firebombs.
  - Shrine: Rig Studio.
- **Battle controls:**
  - Click a lit cell to move, choose an ability (buttons or keys 1-6), then click a target.
  - Right-click or Esc cancels, Z undoes a move, Space ends the turn.
  - Hover an enemy to see how far it can reach.
  - Strikes from behind a foe hit 20% harder.
- **Camp life:** heroes at the Waystation glance at your cursor, stretch, hop and think out loud. Click one and they answer (keep poking and they get annoyed).
- **Debug routes:**
  - `#battle?contract=c1..c16&auto=1&speed=4&lvl=5&gear=1`: the AI plays both sides. Add `map=harbor` (or glade, crypt, quarry, siege, …) to fight on another battlefield.
  - `#studio?id=isolde`

## Art pipeline (`tools/`)

| step | tool |
| --- | --- |
| prompts for all ~110 images | `tools/manifest.py` |
| generate via ComfyUI API (Z-Image `cyberrealisticZImage_v70`, 8 steps, euler/simple, shift 3) | `tools/gen_assets.py` (uses `tools/comfy.py`) |
| characters: T2I → BiRefNet cutout → DWPose keypoints (body + hands + 68-pt face) → Florence-2 prop masks (sword, shield, bow…) | `comfy.character()` + `florence_nodes()` |
| clean alpha, un-mix the studio backdrop from edge pixels, crop, portrait | `tools/process_char.py`, `tools/process_cut.py` |
| review candidates / pick a seed / mirror | `tools/review.py`, `tools/select_char.py`, `tools/mirror_char.py` |
| bake rigs | `npm run bake` → `tools/bake.mjs` |
| CPU pose test sheet | `node tools/posetest.mjs <id>` |
| creatures: T2I → BiRefNet → AP-10K animal keypoints | `comfy.creature()` + `tools/process_creature.py` |
| facial expressions (face-only inpaint) | `tools/gen_expressions.py <id>`, then `tools/clip_faces.py` (clips each patch to the silhouette) |
| body hidden behind props (Z-Image inpaint; gaps between limbs are keyed back to transparent) | `tools/inpaint_under.py <id>` |

Characters are prompted in a right-facing three-quarter **A-pose**, with arms held away from the body. That keeps every limb visible, so the rig never has to invent hidden pixels. The animator then lowers the arms into a natural hang at runtime.

## The rig (`src/rig/`)

The design started from a classic image-mesh rig (nearest-segment weights, per-joint blend radius, arc blending) and replaces each weak point:

- **Bone regions** (`builder.js`): each body pixel is assigned to a bone by an edge-aware, thickness-normalised geodesic Dijkstra that runs inside the silhouette. Seeds are the bone segments. Path cost rises across strong colour edges and transparent gaps, and each bone's front advances at a speed proportional to its limb radius. As a result, a wide torso never loses its edge to a nearby arm, an arm resting against the body stays an arm, and fabric between the legs is detected (crotch-gap search) and kept on the pelvis.
- **Joint blending**: weights blend only between a bone and its parent or children, across the bisector plane of the two bone directions. The band width scales with the measured limb thickness at that joint, so weights are exactly continuous across the seam and vanish away from joints. A few Laplacian passes smooth only the blended band.
- **Layers**: far arm, legs, torso and head, near arm, props. Each layer gets its own grid mesh and a pixel-accurate soft mask (two RGBA mask textures). A lower layer extends 2 px beneath the one above so seams never show. Unrelated bones inside a layer get split vertices, and see-through bridges across gaps are removed.
- **Props**: Florence-2 masks are validated: a mask must touch the gripping hand, the hand is auto-swapped if the generator used the other one, and the mask is kept off the arm. Each prop becomes a rigid bone pivoting at the palm centre, so weapons can be re-aimed in clips. Detached islands, such as a blade the matte broke, re-attach along their principal axis.
- **Skinning**: dual-quaternion (planar dual-complex) blending in the vertex shader handles any number of bones without the candy-wrapper collapse that linear blending gives at elbows and knees.
- **Motion** (`motion.js`, `pose.js`):
  - Clips are retargetable: limb channels are absolute world directions, so one clip fits every rig.
  - Two-bone IK keeps feet planted, and the walk cycle has planted and swing phases.
  - Follow-through springs react to body acceleration.
  - Auto-placed spring zones move hair, skirts and capes.
  - Long hair (from the Florence hair mask) hangs from the head: locks over the shoulders ride the chest, never an arm. The swing grows from the crown to the tips, the lock edges are feathered, hair draws on top of its layer, and the swing is capped by the face size so it never tears into stripes.
  - Torso parts that touch directly in the image (hair against a collar, a collar against the shoulder) stay stitched together, and a heavy jaw the chest claimed is handed back to the head, so mouths and collars stretch instead of tearing.
  - Eyelids are built from the 68 face landmarks, carried by the head bone, filled with sampled lid skin, and blink on a schedule (figures too small on screen to read skip the lids).
  - Breathing is steady and slow at rest, and quickens after exertion.
  - A staff or spear planted on the ground slides up through the grip as the hand drops, so its butt never sinks into the floor. A staff gripped near its top does the same, and a sword, scimitar or mace resting on its tip tilts about the grip so the tip only ever touches the ground.
  - `meta.json` can merge an arm hidden behind its twin into the visible one (`rig.mergeLabels`, used for Mei, whose hands share the staff).
- **Soft body and muscle** (`builder.js` zones, `motion.js`, the vertex shader):
  - Every human rig gets 12 soft zones: belly, chest, cheeks, both biceps, thighs and calves. Each one has its own weight channel, stored sparsely in `rig.json`.
  - Each zone carries a small offset spring (jiggle and settle) and a bulge (muscle flex), both applied before skinning.
  - How much a zone moves comes from the character's **build** (`fat`, `muscle`, `armor`, `form` in `data.js`). A lean archer's chest and arms barely move. A heavy brawler's belly and chest move more, and slower. Plate armour stiffens everything it covers.
  - Footfalls, landings, hits and the heavy clips send a jolt through the zones. Muscles flex at a clip's moment of effort; war cries and victories flex both arms.
  - Chest zones are only active on male builds; this rig has no breast or butt jiggle.
  - Rig Studio → **Body** tunes this per character, built-in or your own:
    - Build sliders, plus **Jiggle by area**: belly, upper arms, thighs, calves, cheeks, hair, skirt and cloth, cape, and breathing. Each goes from 0 (held still) to 2.5×; more means a softer, slower-settling wobble.
    - Areas a figure doesn't have are greyed out.
    - A zone overlay, plus flex, jolt, walk and run previews.
  - Death is a noise dissolve with ember edges.
- **Standing, walking and running** (`motion.js`):
  - **Standing:** the legs are straight. The hips no longer sink with the stance or the breath, since with the feet planted any drop bends the knees.
    - The idle stance is drawn in a little from the generated A-pose. The hips rise a hair to match, so the more upright leg takes the weight and the other relaxes.
  - **One hip solve:** the planted feet set the hip height every frame.
    - The hips drop until no planted leg is stretched past its extension, or rise a little until the tightest one is straight.
    - A clip that crouches (block, slam, death) keeps its bent knees.
  - **Walking:**
    - Step length follows a natural cadence (about 1.9 steps a second) instead of a fixed stride.
    - Stance with heel strike, flat foot, then a rising heel and toe-off; the stance knee holds about 10°, the swing knee reaches about 60°.
    - The feet come in toward one walking line under the body; the wide A-pose would read as a straddle.
    - The hips vault over the planted leg, as the leg geometry gives it.
  - **Jogging** (battle speed): about 3.3 steps a second with a flight phase, an early heel kick, a knee drive, a forward lean and bent arms. The stance knee goes from about 20° at touchdown to 40° mid-stance.
  - Knees always bend forward.
- **Garment follow** (`builder.js`):
  - Fabric below the hip line (skirts, coats, robes, gowns, the crotch of trousers) blends from the pelvis toward the legs it covers.
  - Over a shin, the hem moves exactly like the boot below it. Wider panels hang from the thigh and follow it about half way.
  - No gap opens at the knee or boot, and cloth between the legs stretches instead of tearing.
- **Creature rigs** (`creature.js`, `creature_motion.js`): four-legged companions are rigged from **AP-10K** animal keypoints (ComfyUI `AnimalPosePreprocessor`).
  - Skeleton: pelvis, chest, neck and head, a three-bone tail traced along the silhouette's medial axis, auto-detected wings, and four two-bone legs.
  - The near-side legs draw in front of the body and the far-side legs behind it.
  - Motion: a diagonal-pair walk that becomes a trot, a breathing tail sway and wing beat, and clips (bite, breath, roar, pounce, rear, crouch, hurt, death, victory).
  - Paws are seeded forward from the sole, so a near paw keeps its own toes. The near thigh's copy in the body layer stops at the belly line, so no ghost leg is left hanging. Far legs are shaded as if in the body's shadow.
- **Facial expressions** (`tools/gen_expressions.py`):
  - Z-Image inpaints only the face (from the 68 DWPose landmarks), producing happy, fierce and hurt versions of the same person.
  - In battle the face patch rides the head bone on events: an attack, a hit, a kill, victory, and a hurt look when badly wounded.
  - Expression portraits appear in speech bubbles and on the unit card.
- **Rig Studio** shows bone regions, the mesh wireframe, a per-bone weight heatmap, the raw OpenPose skeleton, every clip, sliders, and joint dragging.

## The second company

Eight new heroines and two companions:

| hero | class | kit |
| --- | --- | --- |
| Ilsa Vaelith (elf) | Wildbow | Twin Arrows, Hamstring, Thornrain, Moonlit Arrow |
| Sable Rourke | Shadow | Shock Baton, Grapple Line, Smoke Bomb (the next attack misses), Takedown (+60% vs. stunned or rooted) |
| Wren Hollis | Beastmaster, with **Frostfang** the frost wolf | Whipcrack, Snare Lash (pull + root), Sic 'Em! (the wolf runs in and mauls), Tend Wounds |
| Isabeau Lark | Stormcaller | Arc Lightning (chains to two more foes), Tempest (stun area), Static Ward, Thunderclap |
| Kaela Draven | Dragonrider, with **Cinder** the dragon | Sky Lance, Dragon Dive, Firebrand (Cinder flies in and breathes fire), Kindred Flame |
| Zhara Grimtusk (half-orc) | Warbreaker | Rending Arc, Skullsplitter, Blood Roar, Earthshaker |
| Nyx Ashborne (demon-blooded) | Hellcaller | Hellfire, Soul Brand, Shadowflame, Infernal Pact (costs health) |
| Selene Ithil (moon elf) | Moonsinger | Moonbeam, Lunar Mend, Starlight Ward, Moonsong |

Companions take the field beside their hero, have their own turns, and scale with the hero's level and gear.

- **Party places:** the party has four places, and a hero with a companion takes two of them.
- **Losing:** if every hero falls, the battle is lost, even if a companion is still standing.
- **Muster the Banners:** a new campaign starts here. Pick who rides out first from the starters and the region-one heroines; everyone else can be hired at the Campfire later.

## The third company

Seven more young-adult heroines, all in their twenties, plus three non-human heroes:

| hero | class | kit |
| --- | --- | --- |
| Vex Marlowe | Corsair | Cutlass, Boarding Rush (-30% defence), Plunder (steals crowns), Broadside (an airship's cannons rake an area) |
| Rhea Solace | Nightstalker | Hand Crossbow, Net Shot (pins for two turns), Caltrops (slows and bleeds), Deadeye (+50% vs. pinned or stunned) |
| Mei Lin | Tempest Fist | Staff Strike (knockback), Whirlwind, Flying Kick (stuns), Inner Calm (heal, cleanse, +30% defence) |
| Sylwen (dryad) | Grovewarden | Thorn Lash, Entangling Roots, Bloom, Grove Song |
| Vaelis D'yrith (dark elf) | Bladedancer | Moon Blade, Dancing Steel, Shadow Veil, Eclipse Strike (always critical) |
| Ondine (sea elf) | Tidecaller | Trident Thrust, Tidal Wave (line knockback), Healing Tide, Riptide (pull + slow) |
| Aurelia Dawn | Dawnblade | Sunsteel Cleave and Judgment (+60% vs. undead), Radiance, Aegis of Dawn |
| Brakka (minotaur) | Ravager | Gore, Stampede, Labrys Sweep, Bellow |
| Korrin Emberscale (dragonborn) | Flamewarden | Hammer Fall, Dragon's Breath, Scale Guard (taunt + ward), Earthbreaker |
| Grum (golem) | Bastion | Stone Fist, Fortress (+80% defence, counter, taunt), Tremor, Rune Burst |

The outfits are fitted and confident: bodysuits, scale and plate armour, leaf-woven dresses over leggings. Brakka's keypoints were placed by hand, because DWPose's person detector does not see a bull-headed figure (`tools/_gen/brakka/s1/pose_raw.json`).

## The campaign: why every battle matters

- **Injuries:** a hero who falls is wounded. They sit out the next battle after a victory, or the next two after a defeat, and rejoin the party when they recover. A physician at the Campfire can patch them up early for crowns. A companion that falls is hurt too, and its hero marches alone until it heals. Places left open by the wounded go to healthy heroes from the bench, who step aside again when the regulars recover. If nobody healthy is left, the wounded march anyway at 60% health.
- **No free retreats:** sounding the retreat (or reloading, or closing the tab mid-battle) keeps the contract open, but anyone who already fell is hurt as in a defeat, supplies used stay spent, and a day passes.
- **Spoils:** victories can drop **trinkets**, such as an Ember Charm, a Blood Vial, the Troll-Tooth Necklace or the King's Last Coin. There are 12 in all, and each hero can wear one. Unworn trinkets wait in the stash.
- **Boons:** the first time the company clears a contract, that place pays it back for the rest of the campaign. Examples: road tolls after every battle, a chapel infirmary that gets heroes hurt in a defeat back after one battle instead of two, cheaper forge work, a fifth party place, free physicians, more experience, cheaper supplies and stronger powder kegs. The War Table shows each contract's boon before you march.
- **Bounties:** every freed region posts two repeatable bounties each day, for crowns, experience and spoils.
- **Side contracts:** five optional fights on the new battlefields: the Moonlit Glade, the Sunken Crypt, Smugglers' Wharf, the Ash Quarry and the Siege Lines. Each one opens after a main contract in its region.
- **Battlefields:** twelve in all. The five new ones are a harbour, a moonlit glade, a crypt, a crystal quarry and a siege ground.
- **Interactive ground:**
  - **Powder kegs** blow up when struck by any attack, caught in a blast or breath, or slammed into by a pushed foe. They burn everyone nearby, friend or foe, and leave fire on the ground. Hovering a target shows who a blast would catch. Heals never set them off. The AI uses them too. They are black skull-marked casks with a lit fuse and a red ring on the ground, so they never read as scenery barrels.
  - **Chests** give crowns, and sometimes a trinket, to the hero who ends up on them (walking, dashing, teleporting or being pulled).
  - **Healing springs** restore health at the start of a turn spent standing in them.
  - **Burning ground** hurts anyone who starts a turn in it.

## Your own characters, rigs and animations (Rig Studio)

Open the Rig Studio from the camp's **Shrine of Likeness** or from the title screen.

- **Change this character** works on any character, built-ins and enemies included:
  - **New picture:** it is cut out, posed and fully re-rigged, the same as an upload. ComfyUI does it when running: DWPose for people, AP-10K animal pose for beasts like Cinder and Frostfang. Name the held weapon for a Florence-2 mask.
    - A built-in keeps its class, skills and level. Clips, body and jiggle settings carry over; joint edits from the old picture are cleared.
  - **Name and height:** for any character, and fighting style for your own.
  - **Restore the original** puts a built-in back to its baked picture, rig and name.
- **+ Add your own:**
  - Upload a full-body image. PNG with transparency works best; flat or gradient backdrops are removed automatically, with a tolerance slider.
  - Optionally upload an OpenPose / DWPose JSON. BODY_25, COCO-18, ComfyUI's list format and normalised coordinates all work.
  - **Auto-rig with my ComfyUI:** while ComfyUI runs on `127.0.0.1:8188`, the dev server proxies it at `/comfy`. The upload is then cut out with BiRefNet and posed with DWPose. If you name the held weapon, Florence-2 masks it so it swings as one rigid piece. Everything stays on your machine.
  - Give the character a name, a fighting style (Knight, Ranger, Pyromancer, Battle Priest, Duelist, Berserker, Lancer, Hexblade) and a height. The style sets their abilities and stats.
  - Without a JSON you get a template skeleton. Drag its dots onto the figure in **Rig → Edit joints**; the rig rebuilds when you let go.
  - Your characters can be hired for free at the **Campfire**, then fight with the rest of the company.
- **Rig tab:**
  - **Joint stretch:** a global setting for how wide the stretch area at every joint is.
  - **Per-joint stretch:** click a joint's circle and set its own width.
  - **Smoothing:** the number of passes used to smooth the weights.
  - **Stitch seams:** keeps every triangle joined, so limbs stretch at the joints instead of opening gaps.
  - **Show zones:** draws each stretch area as a circle.
  - **Edit joints:** drag the skeleton onto the figure. Works for built-in characters too; **Reset rig to auto** undoes your edits.
- **Animate → Edit an animation:**
  - Each clip opens on a timeline.
  - Select a key, then drag the character's limbs or move the channel sliders to pose it. The channels are body shift, hips, back, chest, neck, head, both arms, weapon angles and both feet.
  - Keys can be added and deleted, with easing, timing, length and hit-moment controls.
  - **Save** makes battles use your version for that character; **Default** restores the original.

Everything you make is saved in the project's `saves/` folder and in this browser's storage (see **Saving** above). It isn't uploaded anywhere.
