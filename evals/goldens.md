# Goldens — La Bobine

Deux surfaces AI. Rejouer ces goldens avant tout changement de modèle ou de
prompt système (doctrine : `~/Claude/apps/_CONDUITE_AI.md`).

## 1. Art direction (`artDirect`, Claude Haiku) — pattern *inline suggestion*

Entrée type (poème FR, 2 strophes) :

```
1. Le matin plie sa brume comme un drap qu'on range
2. et la table attend, patiente, le premier café
```

Attendu (vérifié 2026-07-09, claude-haiku-4-5) :

- [ ] JSON strict `{style, prompts}`, exactement un prompt par strophe, en ordre
- [ ] prompts en **anglais**, scène concrète fidèle à la strophe (la strophe 2
      doit parler de table/tasse/attente — pas d'invention hors-poème)
- [ ] un seul monde visuel cohérent entre les prompts
- [ ] `style` = clause traînante (médium, palette, lumière) incluant
      « no people, no text »
- [ ] jamais de visages ni de lettrage demandés
- Échantillon réel : strophe 2 → « An empty wooden table bathed in early
  sunlight, a single empty coffee cup waiting patiently… » ✓

Garde-fous produit (à re-vérifier à la main) :

- [ ] ne remplit QUE les prompts vides (`onlyEmpty: true` par défaut)
- [ ] ne touche pas au `style` déjà saisi par Jac
- [ ] sans clé Anthropic : fallback = texte des strophes, aucun échec
- [ ] étiquette UI : « propositions / ébauches — à modifier à ton goût »

## 2. Alignement forcé (ElevenLabs) — pas un LLM, mais golden quand même

Fixture : `say -v Amélie` sur le poème ci-dessus + nappe sinusoïdale à -28 dB
+ 2,5 s d'outro musical (voir la session de build du 2026-07-09).

- [ ] `aligned: true` malgré la musique sous la voix
- [ ] la pause entre strophes tombe ENTRE les deux repères
- [ ] le repère 2 se termine avant l'outro (speechEnd < durée du fichier)
- [ ] poème modifié + « Réaligner » ⇒ mêmes propriétés
- Mesuré : strophe 1 = 0→3,07 s, strophe 2 = 3,48→7,21 s sur 9,48 s ✓

Fallback (clé retirée) : cues estimées au prorata, badge « synchro estimée »,
blocs toujours glissables — jamais un état d'erreur sec.
