export type SuperlativeMetric = "price" | "year" | "recency" | "value";
export type SuperlativeDirection = "min" | "max";

export type ClassifiedIntent =
  | {
      kind: "superlative";
      metric: SuperlativeMetric;
      direction: SuperlativeDirection;
      matchedPhrase: string;
    }
  | { kind: "unknown" };

type IntentRule = {
  metric: SuperlativeMetric;
  direction: SuperlativeDirection;
  phrases: readonly string[];
};

/**
 * Ordered from semantically specific to broad. Add synonyms here without
 * changing classifier control flow or downstream result types.
 */
const SUPERLATIVE_RULES: readonly IntentRule[] = [
  {
    metric: "value",
    direction: "max",
    phrases: [
      "best value",
      "best deal",
      "meilleure affaire",
      "meilleur rapport qualite prix",
      "meilleur rapport qualité prix",
      "meilleur rapport qualité-prix",
      "bon plan",
    ],
  },
  {
    metric: "recency",
    direction: "max",
    phrases: [
      "most recent",
      "most recently listed",
      "latest listing",
      "newly listed",
      "recently added",
      "le plus recent",
      "le plus récent",
      "la plus recente",
      "la plus récente",
      "derniere annonce",
      "dernière annonce",
    ],
  },
  {
    metric: "price",
    direction: "min",
    phrases: [
      "cheapest",
      "lowest price",
      "least expensive",
      "most affordable",
      "best price",
      "le moins cher",
      "la moins chere",
      "la moins chère",
      "prix le plus bas",
      "meilleur prix",
    ],
  },
  {
    metric: "year",
    direction: "max",
    phrases: [
      "newest",
      "latest model year",
      "newest model year",
      "plus neuf",
      "plus recente annee modele",
      "plus récente année modèle",
      "modele le plus recent",
      "modèle le plus récent",
    ],
  },
];

export function classifyIntent(message: string): ClassifiedIntent {
  const normalizedMessage = normalize(message);
  if (!normalizedMessage) return { kind: "unknown" };

  for (const rule of SUPERLATIVE_RULES) {
    for (const phrase of rule.phrases) {
      const normalizedPhrase = normalize(phrase);
      if (containsPhrase(normalizedMessage, normalizedPhrase)) {
        return {
          kind: "superlative",
          metric: rule.metric,
          direction: rule.direction,
          matchedPhrase: normalizedPhrase,
        };
      }
    }
  }

  return { kind: "unknown" };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(message: string, phrase: string): boolean {
  return (` ${message} `).includes(` ${phrase} `);
}
