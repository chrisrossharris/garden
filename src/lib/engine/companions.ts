export type CompanionAnalysis = {
  companions: string[];
  cautions: string[];
  suggestions: string[];
};

export type BedZone = 'border' | 'center' | 'trellis';

type CompanionRule = {
  goodWith?: string[];
  cautionWith?: string[];
  suggestIfMissing?: string[];
};

const RULES: Record<string, CompanionRule> = {
  Tomato: {
    goodWith: ['Purple Coneflower', 'Bell Pepper'],
    cautionWith: ['Cucumber'],
    suggestIfMissing: ['Purple Coneflower']
  },
  Cucumber: {
    goodWith: ['Purple Coneflower'],
    cautionWith: ['Tomato'],
    suggestIfMissing: ['Purple Coneflower']
  },
  'Bell Pepper': {
    goodWith: ['Purple Coneflower', 'Tomato'],
    suggestIfMissing: ['Purple Coneflower']
  },
  'Knock Out Rose': {
    goodWith: ['Purple Coneflower'],
    suggestIfMissing: ['Purple Coneflower']
  },
  'Purple Coneflower': {
    goodWith: ['Tomato', 'Cucumber', 'Bell Pepper', 'Knock Out Rose']
  }
};

const PLACEMENT_ZONE: Record<string, BedZone> = {
  Tomato: 'center',
  Cucumber: 'trellis',
  'Bell Pepper': 'center',
  'Knock Out Rose': 'border',
  'Purple Coneflower': 'border'
};

const PLACEMENT_REASON: Record<string, string> = {
  Tomato: 'keep central airflow and spacing',
  Cucumber: 'benefits from edge trellising',
  'Bell Pepper': 'stable, sun-rich center position',
  'Knock Out Rose': 'works well as a structural edge anchor',
  'Purple Coneflower': 'best as a pollinator border strip'
};

function hasPair(names: Set<string>, a: string, b: string) {
  return names.has(a) && names.has(b);
}

function normalizePair(a: string, b: string) {
  return [a, b].sort().join('|');
}

export function analyzeCompanions(plantNames: string[]): CompanionAnalysis {
  const unique = [...new Set(plantNames)];
  const nameSet = new Set(unique);
  const companions: string[] = [];
  const cautions: string[] = [];
  const suggestions: string[] = [];
  const seenGood = new Set<string>();
  const seenCaution = new Set<string>();

  for (const name of unique) {
    const rule = RULES[name];
    if (!rule) continue;

    for (const match of rule.goodWith ?? []) {
      if (hasPair(nameSet, name, match)) {
        const pair = normalizePair(name, match);
        if (seenGood.has(pair)) continue;
        seenGood.add(pair);
        const [left, right] = pair.split('|');
        companions.push(`${left} + ${right} are a strong companion combo`);
      }
    }

    for (const conflict of rule.cautionWith ?? []) {
      if (hasPair(nameSet, name, conflict)) {
        const pair = normalizePair(name, conflict);
        if (seenCaution.has(pair)) continue;
        seenCaution.add(pair);
        const [left, right] = pair.split('|');
        cautions.push(`${left} + ${right} may compete or increase disease pressure`);
      }
    }

    for (const suggested of rule.suggestIfMissing ?? []) {
      if (!nameSet.has(suggested)) {
        const line = `Consider adding ${suggested} to support ${name}`;
        if (!suggestions.includes(line)) suggestions.push(line);
      }
    }
  }

  return { companions, cautions, suggestions };
}

export function suggestedZoneForPlant(name: string): BedZone {
  return PLACEMENT_ZONE[name] ?? 'center';
}

export function suggestedZoneReasonForPlant(name: string): string {
  return PLACEMENT_REASON[name] ?? 'balanced placement for general growth';
}
