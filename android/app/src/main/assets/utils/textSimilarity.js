export function tokenize(text) {
  if (!text) return [];
  return Array.from(
    new Set(
      String(text)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    )
  );
}

function jaroDistance(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  const maxDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const matches = [];
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - maxDist);
    const end = Math.min(i + maxDist + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches.push({ i, j });
      break;
    }
  }

  const matchesCount = matches.length;
  if (!matchesCount) return 0;

  const s1Chars = [];
  const s2Chars = [];
  matches.forEach(({ i, j }) => {
    s1Chars.push(s1[i]);
    s2Chars.push(s2[j]);
  });

  let transpositions = 0;
  for (let i = 0; i < s1Chars.length; i++) {
    if (s1Chars[i] !== s2Chars[i]) transpositions++;
  }
  transpositions /= 2;

  return (
    (matchesCount / s1.length + matchesCount / s2.length + (matchesCount - transpositions) / matchesCount) /
    3
  );
}

export function jaroWinkler(a, b, prefixScale = 0.1, maxPrefix = 4) {
  const jd = jaroDistance(a, b);
  if (jd < 0.7) return jd;
  let prefix = 0;
  for (let i = 0; i < Math.min(maxPrefix, a.length, b.length); i++) {
    if (a[i].toLowerCase() === b[i].toLowerCase()) prefix++;
    else break;
  }
  return jd + prefix * prefixScale * (1 - jd);
}

export function computeTokenSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setB = new Set(tokensB);
  let intersection = 0;
  tokensA.forEach(token => {
    if (setB.has(token)) intersection++;
  });
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

export function computeNameSimilarity(textA, textB) {
  const jw = jaroWinkler(textA || '', textB || '');
  const tokenScore = computeTokenSimilarity(tokenize(textA), tokenize(textB));
  return jw * 0.65 + tokenScore * 0.35;
}
