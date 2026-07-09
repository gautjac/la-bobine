# La Bobine.

**Un poème, une narration → un reel Instagram monté.**

Chaque matin : tu colles le poème, tu déposes le mix audio (narration + musique),
La Bobine transcrit-aligne le texte sur ta voix, et tu montes les images sur une
timeline — génération d'images par Fal (six modèles au menu), transitions, Ken
Burns, bande noire au tiers avec les strophes une à la fois. Export MP4
1080×1920\@30 prêt pour Instagram, déposé dans `~/Movies/La Bobine` et révélé
dans le Finder.

## Démarrer

```bash
cd ~/Claude/apps/la-bobine
npm install          # une fois
npm run studio       # serveur (7788) + app (http://localhost:5788)
```

`.env` (jamais commité) :

```
FAL_KEY=…               # génération d'images (fal.run)
ELEVENLABS_API_KEY=…    # forced alignment — cale les strophes sur la narration
ANTHROPIC_API_KEY=…     # optionnel : « Proposer des prompts » (Claude Haiku)
```

Dépendances système : `ffmpeg`/`ffprobe` (normalisation + durée de l'audio),
Chrome headless (Remotion le télécharge tout seul au premier rendu).

## Le flux du matin

1. **Bibliothèque → Nouvelle bobine** : titre, poème (ligne vide = strophe),
   fichier audio. À l'ingestion, ElevenLabs *forced alignment* trouve la fenêtre
   parlée de chaque ligne — même sous la musique — et en dérive un repère par
   strophe (petite avance à l'entrée, traîne à la sortie). Sans clé ElevenLabs,
   la synchro est estimée au prorata (badge « synchro estimée ») et reste
   entièrement ajustable.
2. **Timeline** (trois pistes) :
   - **Images** — un clip par strophe au départ. Poignée droite = durée; la
     dernière image s'étire jusqu'à la fin de l'audio. **Glisse un bloc** pour
     changer l'ordre (repère ambre = point d'insertion; prompts et galeries
     suivent le clip); flèches ←/→ dans l'inspecteur aussi; « + Image »,
     « Répartir également ».
   - **Texte** — les repères de strophes; glisse le bloc, rogne les bords.
   - **Audio** — la forme d'onde; clique la règle pour naviguer. Espace = jouer.
3. **Inspecteur** (clic sur un clip) : prompt, **menu des modèles Fal**,
   « Générer ». Chaque génération s'ajoute à la **galerie du clip** — clique
   une vignette pour choisir celle qui joue, régénère sans rien perdre.
   « ✳ Proposer des prompts » (onglet Bobine) demande à Claude une ébauche par
   strophe + un style partagé — ne remplit que les champs vides.
4. **Cartes** (onglet Bobine, activées par défaut) : une **carte-titre** — 3 s
   de noir avec le titre, avant que l'audio commence — et une **carte finale**
   avec le poème entier + crédit, qui prend le relais après la narration,
   pendant l'outro musical. Si l'outro est trop court pour lire le poème, le
   reel s'étire de quelques secondes (silence tenu). La timeline reste sur
   l'horloge de l'audio; le décalage de la carte-titre est géré tout seul.
5. **Exporter le reel** — rendu Remotion serveur, H.264/AAC, audio intact.
   « Affiche (PNG) » exporte l'image de couverture à la tête de lecture.

## Les douze modèles (chacun testé en vrai le 2026-07-09)

| Modèle | Usage | ~Temps |
| --- | --- | --- |
| FLUX Schnell | brouillon éclair | 4 s |
| FLUX Dev | le bon défaut | 3–8 s |
| FLUX 1.1 Pro | qualité fine | 7 s |
| FLUX 1.1 Ultra | grand format (3:4 recadré) | 12 s |
| Recraft V3 | illustration, matières | 8 s |
| Ideogram V3 | graphique, affiches | 21 s |
| FLUX.2 Dev | la relève, ouverte (32B) | 9 s |
| FLUX.2 Pro | le nouveau standard | 13 s |
| FLUX.2 Max | le sommet FLUX | 34 s |
| Nano Banana 2 (Google) | suit les consignes à la lettre | 17 s |
| Seedream 5.0 Lite | raisonne avant de peindre, 2K | 30 s |
| Imagen 4 (Google) | photoréalisme | 8 s |
| Luma Photon | regard cinéaste, très économique | 17 s |

(Treize en comptant Photon. Qwen Image a été écarté : 5 min de démarrage à
froid chez Fal — inutilisable en montage.)

En ajouter un = une entrée dans `src/lib/models.ts` (id Fal + libellé +
constructeur de requête). Les images sont demandées en 1080×1280 — le
complément exact de la bande au tiers sur 1080×1920; la composition
*cover-fit*, donc un ratio approximatif passe aussi.

## Architecture

```
server/index.ts     serveur studio (tsx) : bibliothèque projets/, ingestion
                    (ffmpeg + forced alignment), génération Fal, ébauches
                    Claude, rendu Remotion spawné → ~/Movies/La Bobine
src/Bobine.tsx      LA composition (Player du navigateur = rendu headless)
src/lib/            maths pures partagées + testées : alignement → repères,
                    frontières de clips, Ken Burns, registre de modèles
app/                l'éditeur React (bibliothèque, timeline, inspecteur)
projects/<id>/      project.json + vo.mp3 + images/ (données locales, non
                    versionnées — chaque génération garde son fichier)
```

Le Player et le rendu consomment **les mêmes props** dérivées du même
`buildRenderProps` : ce que tu vois est ce qui s'exporte.

```bash
npm test            # 75 tests (alignement, timeline, modèles, motion…)
npm run build       # tsc --noEmit + vite build (doit passer avant de pousser)
npm run web         # app compilée servie par le serveur seul (sans Vite)
```

## Notes

- **Une seule instance à la fois.** Le studio veut les ports 5788 + 7788; une
  deuxième instance s'arrête avec un message clair au lieu de dériver. Si
  l'app affiche la bannière « serveur ne répond plus », relance « La
  Bobine.command » — la page se reconnecte et resauvegarde toute seule.

- Les avertissements console `EncodingError … cannot be decoded` pendant le
  scrubbing sont des `decode()` interrompus par les remontages de séquences —
  Remotion réessaie et réussit; bénin.
- Supprimer un clip garde ses fichiers d'images sur disque (orphelins
  inoffensifs); le grand ménage = supprimer la bobine.
- Conduite AI : ébauches étiquetées, remplissage des champs vides seulement,
  rejet en un geste, attente scénarisée honnête, goldens dans
  `evals/goldens.md`.
