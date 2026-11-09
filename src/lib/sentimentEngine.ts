/**
 * sentimentEngine.ts
 * 
 * Hybrid sentiment analysis engine combining:
 * 1. AFINN-based lexicon scoring
 * 2. Negative phrase detection (handles "bait and switch", "beware", etc.)
 * 3. Rating-aware sentiment (a 1-star review with ambiguous text = negative)
 * 4. Contextual modifiers (negation, intensifiers, diminishers)
 * 5. Aspect-based sentiment extraction
 * 
 * Based on research from VADER (Hutto & Gilbert, 2014) and
 * aspect-based sentiment analysis (Pontiki et al., 2016).
 */

// ============================================================
// NEGATIVE PHRASES - catches multi-word expressions the basic
// sentiment library completely misses
// ============================================================
import { supportedSentimentText } from './reviewPolicy';

const NEGATIVE_PHRASES: [string, number][] = [
    ['bait and switch', -4], ['do not recommend', -3], ['don\'t recommend', -3],
    ['waste of time', -3], ['waste of money', -4], ['rip off', -4], ['ripoff', -4],
    ['ripped off', -4], ['stay away', -4], ['beware', -3], ['be warned', -3],
    ['never again', -3], ['never come back', -3], ['never go back', -3],
    ['never going back', -3], ['never returning', -3], ['worst experience', -4],
    ['worst ever', -4], ['total disaster', -4], ['complete disaster', -4],
    ['absolutely terrible', -4], ['absolutely horrible', -4], ['scam', -4],
    ['con artist', -5], ['fraud', -5], ['fraudulent', -5], ['dishonest', -4],
    ['took advantage', -3], ['taken advantage', -3], ['not worth', -3],
    ['zero stars', -5], ['0 stars', -5], ['wish i could give zero', -5],
    ['health hazard', -5], ['food poisoning', -5], ['got sick', -4],
    ['made me sick', -4], ['called the police', -5], ['filed a complaint', -4],
    ['better business bureau', -3], ['report them', -4], ['sue', -3],
    ['lawyer', -2], ['discrimination', -5], ['discriminated', -5],
    ['racist', -5], ['sexist', -5], ['harassed', -5], ['harassment', -5],
    ['threatened', -5], ['unsafe', -4], ['dangerous', -4],
    ['very disappointed', -3], ['extremely disappointed', -4],
    ['highly disappointed', -3], ['so disappointed', -3],
    ['not impressed', -2], ['underwhelmed', -2], ['overrated', -2],
    ['overhyped', -2], ['misleading', -3], ['false advertising', -4],
    ['lied to', -4], ['lied', -3], ['lies', -3], ['deceptive', -4],
    ['unprofessional', -3], ['incompetent', -3], ['careless', -2],
    ['couldn\'t care less', -3], ['don\'t care', -2], ['ignored me', -3],
    ['ignored us', -3], ['walked out', -3], ['left without', -2],
    ['no accountability', -3], ['no responsibility', -3],
    ['price gouging', -4], ['highway robbery', -4], ['stole', -4],
    ['stolen', -4], ['broke', -2], ['broken', -2], ['damaged', -2],
    ['ruined', -3], ['destroyed', -3],
];

const POSITIVE_PHRASES: [string, number][] = [
    ['highly recommend', 4], ['highly recommended', 4], ['can\'t recommend enough', 5],
    ['above and beyond', 4], ['went above and beyond', 4], ['exceeded expectations', 4],
    ['five stars', 4], ['5 stars', 4], ['top notch', 4], ['top-notch', 4],
    ['first class', 4], ['first-class', 4], ['world class', 5], ['world-class', 5],
    ['best in town', 4], ['best in the city', 4], ['best ever', 4],
    ['life changing', 5], ['life-changing', 5], ['game changer', 4],
    ['hidden gem', 4], ['pleasant surprise', 3], ['blown away', 4],
    ['absolutely amazing', 4], ['absolutely wonderful', 4], ['absolutely fantastic', 4],
    ['truly exceptional', 5], ['truly outstanding', 5], ['truly remarkable', 4],
    ['can\'t say enough', 4], ['nothing but praise', 4], ['couldn\'t be happier', 4],
    ['couldn\'t ask for more', 4], ['second to none', 4], ['a cut above', 3],
    ['worth every penny', 4], ['worth the money', 3], ['great value', 3],
    ['fair price', 3], ['reasonable price', 2], ['well worth', 3],
    ['very professional', 3], ['extremely professional', 4],
    ['very helpful', 3], ['extremely helpful', 4], ['so helpful', 3],
    ['very friendly', 3], ['extremely friendly', 4], ['warm and welcoming', 3],
    ['attention to detail', 3], ['went the extra mile', 4],
    ['look forward to', 2], ['coming back', 2], ['will return', 2],
    ['must visit', 3], ['don\'t miss', 3],
];

// Single-word lexicon (AFINN-inspired, extended for reviews)
const WORD_SCORES: Record<string, number> = {
    // Strong negatives
    terrible: -4, horrible: -4, awful: -4, dreadful: -4, atrocious: -4,
    abysmal: -4, disgusting: -4, revolting: -4, appalling: -4, pathetic: -3,
    worst: -4, hate: -3, hated: -3, angry: -3, furious: -4, outraged: -4,
    unacceptable: -3, inexcusable: -4, deplorable: -4, abominable: -4,
    // Moderate negatives
    bad: -2, poor: -2, disappointing: -2, disappointed: -2, mediocre: -2,
    subpar: -2, lackluster: -2, underwhelming: -2, frustrating: -2,
    annoying: -2, irritating: -2, unpleasant: -2, uncomfortable: -2,
    rude: -3, disrespectful: -3, dismissive: -2, arrogant: -2,
    slow: -1, cold: -1, dirty: -2, filthy: -3, messy: -2,
    overpriced: -2, expensive: -1, stale: -2, bland: -1,
    // Mild negatives
    okay: -0.5, ok: -0.5, meh: -1, average: -0.5, nothing: -0.5,
    // Mild positives
    good: 1, nice: 1, decent: 1, fine: 0.5, alright: 0.5,
    pleasant: 1, satisfactory: 1, adequate: 0.5,
    // Moderate positives
    great: 2, excellent: 3, wonderful: 3, fantastic: 3, awesome: 3,
    amazing: 3, outstanding: 3, superb: 3, brilliant: 3, marvelous: 3,
    exceptional: 3, impressive: 2, remarkable: 2, delightful: 2,
    lovely: 2, beautiful: 2, perfect: 3, phenomenal: 3, incredible: 3,
    magnificent: 3, splendid: 3, stellar: 3, fabulous: 3,
    friendly: 2, helpful: 2, professional: 2, courteous: 2,
    knowledgeable: 2, attentive: 2, efficient: 2, thorough: 2,
    clean: 1, fresh: 1, delicious: 2, tasty: 2, yummy: 2,
    // Strong positives
    love: 3, loved: 3, adore: 3, treasure: 3, cherish: 3,
    extraordinary: 4, miraculous: 4, flawless: 4, impeccable: 4,
    // Special words
    recommend: 2, recommended: 2,
};

// Negation words that flip sentiment 
const NEGATORS = new Set([
    'not', 'no', 'never', 'neither', 'nor', 'nobody', 'nothing',
    'nowhere', 'hardly', 'barely', 'scarcely', "n't", 'dont', "don't",
    'doesnt', "doesn't", 'didnt', "didn't", 'wasnt', "wasn't",
    'werent', "weren't", 'wont', "won't", 'wouldnt', "wouldn't",
    'shouldnt', "shouldn't", 'cant', "can't", 'cannot', 'without',
]);

// Intensifiers that boost sentiment
const INTENSIFIERS: Record<string, number> = {
    very: 1.3, really: 1.3, extremely: 1.5, incredibly: 1.5,
    absolutely: 1.4, totally: 1.3, completely: 1.3, utterly: 1.4,
    quite: 1.1, particularly: 1.2, especially: 1.2, remarkably: 1.3,
    exceptionally: 1.4, so: 1.2, such: 1.2, super: 1.3,
};

// Diminishers that reduce sentiment
const DIMINISHERS: Record<string, number> = {
    somewhat: 0.6, slightly: 0.5, barely: 0.4, hardly: 0.4,
    kind: 0.7, sort: 0.7, almost: 0.7, nearly: 0.8,
    fairly: 0.8, rather: 0.7, a_bit: 0.6, a_little: 0.5,
};

export interface SentimentResult {
    score: number;        // -5 to +5 normalized
    compound: number;     // -1 to +1 (VADER-style compound)
    label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED' | 'NOT_ASSESSED';
    confidence: number;   // 0-1
    positiveWords: string[];
    negativeWords: string[];
    emotion: string;
    aspects: { aspect: string; sentiment: string; score: number }[];
}

export function analyzeSentiment(text: string | undefined, rating?: number): SentimentResult {
    if (text?.trim() && !supportedSentimentText(text)) {
        return { score: 0, compound: 0, label: 'NOT_ASSESSED', confidence: 0, positiveWords: [], negativeWords: [], emotion: 'Not assessed', aspects: [] };
    }
    if (!text || text.trim().length === 0) {
        // No text — use rating as sole signal
        if (rating !== undefined) {
            const ratingScore = (rating - 3) * 1.5; // 1→-3, 2→-1.5, 3→0, 4→1.5, 5→3
            return {
                score: ratingScore,
                compound: Math.max(-1, Math.min(1, ratingScore / 4)),
                label: rating >= 4 ? 'POSITIVE' : rating <= 2 ? 'NEGATIVE' : 'NEUTRAL',
                confidence: 0.3,
                positiveWords: [], negativeWords: [],
                emotion: rating >= 4 ? 'Satisfaction' : rating <= 2 ? 'Dissatisfaction' : 'Neutral',
                aspects: [],
            };
        }
        return { score: 0, compound: 0, label: 'NEUTRAL', confidence: 0, positiveWords: [], negativeWords: [], emotion: 'Neutral', aspects: [] };
    }

    const lower = text.toLowerCase();
    let totalScore = 0;
    const posWords: string[] = [];
    const negWords: string[] = [];

    // Step 1: Check negative phrases (highest priority)
    for (const [phrase, phraseScore] of NEGATIVE_PHRASES) {
        if (lower.includes(phrase)) {
            totalScore += phraseScore;
            negWords.push(phrase);
        }
    }

    // Step 2: Check positive phrases
    for (const [phrase, phraseScore] of POSITIVE_PHRASES) {
        if (lower.includes(phrase)) {
            totalScore += phraseScore;
            posWords.push(phrase);
        }
    }

    // Step 3: Word-level scoring with context
    const words = lower.replace(/[^a-z'\s-]/g, '').split(/\s+/).filter(w => w.length > 1);
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordScore = WORD_SCORES[word];
        if (wordScore === undefined) continue;

        let modifier = 1.0;

        // Check previous 3 words for negation
        for (let j = Math.max(0, i - 3); j < i; j++) {
            if (NEGATORS.has(words[j])) { modifier *= -0.8; break; }
        }

        // Check previous word for intensifier/diminisher
        if (i > 0) {
            const prev = words[i - 1];
            if (INTENSIFIERS[prev]) modifier *= INTENSIFIERS[prev];
            if (DIMINISHERS[prev]) modifier *= DIMINISHERS[prev];
        }

        const adjusted = wordScore * modifier;
        totalScore += adjusted;
        if (adjusted > 0) posWords.push(word);
        else if (adjusted < 0) negWords.push(word);
    }

    // Step 4: Punctuation and capitalization rules (VADER-inspired)
    const exclamationCount = (text.match(/!/g) || []).length;
    if (exclamationCount > 0 && exclamationCount <= 3) {
        totalScore += totalScore > 0 ? 0.3 * exclamationCount : -0.2 * exclamationCount;
    }

    // ALL CAPS boost
    const capsWords = text.split(/\s+/).filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
    if (capsWords.length > 0 && capsWords.length < text.split(/\s+/).length * 0.8) {
        totalScore += totalScore > 0 ? 0.5 : -0.5;
    }

    // Step 5: Rating integration — if rating contradicts text, adjust
    if (rating !== undefined) {
        const ratingSignal = (rating - 3) * 0.8;
        // If text sentiment and rating agree, boost confidence
        // If they disagree, blend them (rating is strong signal)
        if ((totalScore > 0 && rating <= 2) || (totalScore < 0 && rating >= 4)) {
            totalScore = totalScore * 0.4 + ratingSignal * 0.6; // Rating wins on conflicts
        } else if (Math.abs(totalScore) < 0.5) {
            totalScore += ratingSignal * 0.7; // Text is ambiguous, lean on rating
        } else {
            totalScore += ratingSignal * 0.3; // Both agree, minor boost
        }
    }

    // Normalize to -5 to +5 range
    const clampedScore = Math.max(-5, Math.min(5, totalScore));

    // Compound score (-1 to +1, VADER-style normalization)
    const compound = clampedScore / Math.sqrt(clampedScore * clampedScore + 15);

    // Label
    let label: SentimentResult['label'];
    if (compound >= 0.05) label = 'POSITIVE';
    else if (compound <= -0.05) label = 'NEGATIVE';
    else if (posWords.length > 0 && negWords.length > 0) label = 'MIXED';
    else label = 'NEUTRAL';

    // If rating is 1-2 and we're still neutral, force negative
    if (rating !== undefined && rating <= 2 && label === 'NEUTRAL') label = 'NEGATIVE';
    if (rating !== undefined && rating === 1 && label !== 'NEGATIVE') label = 'NEGATIVE';

    // Confidence
    const wordEvidence = posWords.length + negWords.length;
    let confidence = Math.min(1, wordEvidence * 0.15 + (rating !== undefined ? 0.3 : 0));

    // Emotion detection
    const emotion = detectEmotionAdvanced(text, label, rating);

    // Aspect extraction
    const aspects = extractAspects(text);

    return {
        score: parseFloat(clampedScore.toFixed(3)),
        compound: parseFloat(compound.toFixed(4)),
        label, confidence: parseFloat(confidence.toFixed(2)),
        positiveWords: [...new Set(posWords)].slice(0, 10),
        negativeWords: [...new Set(negWords)].slice(0, 10),
        emotion, aspects,
    };
}

function detectEmotionAdvanced(text: string, label: string, rating?: number): string {
    const lower = text.toLowerCase();
    const emotions: [string, string[]][] = [
        ['Anger', ['angry', 'furious', 'outraged', 'infuriated', 'livid', 'fuming', 'enraged', 'irate', 'unacceptable', 'disgusted', 'disgusting']],
        ['Frustration', ['frustrated', 'annoying', 'irritating', 'waited', 'slow', 'wasted', 'ridiculous', 'useless', 'pointless', 'incompetent']],
        ['Disappointment', ['disappointed', 'disappointing', 'letdown', 'let down', 'expected better', 'underwhelming', 'mediocre', 'not what I expected']],
        ['Fear/Concern', ['unsafe', 'dangerous', 'scared', 'worried', 'concerning', 'alarming', 'beware', 'warning', 'health hazard']],
        ['Sadness', ['sad', 'heartbroken', 'devastated', 'crushed', 'miss', 'unfortunately', 'regret', 'shame', 'too bad']],
        ['Joy', ['amazing', 'wonderful', 'fantastic', 'love', 'loved', 'awesome', 'delighted', 'happy', 'thrilled', 'ecstatic', 'overjoyed']],
        ['Gratitude', ['thank', 'grateful', 'appreciate', 'thankful', 'thanks', 'blessed', 'indebted']],
        ['Trust', ['reliable', 'professional', 'trustworthy', 'honest', 'dependable', 'consistent', 'integrity']],
        ['Surprise', ['surprised', 'unexpected', 'shocked', 'wow', 'blown away', 'exceeded', 'astonished', 'stunned']],
        ['Contempt', ['scam', 'fraud', 'con', 'crook', 'liar', 'cheat', 'shameless', 'pathetic', 'joke', 'laughable']],
    ];

    let best = 'Neutral';
    let bestCount = 0;
    for (const [emotion, words] of emotions) {
        const count = words.filter(w => lower.includes(w)).length;
        if (count > bestCount) { bestCount = count; best = emotion; }
    }

    if (best === 'Neutral' && rating !== undefined) {
        if (rating >= 4) best = 'Satisfaction';
        else if (rating <= 2) best = 'Dissatisfaction';
    }

    return best;
}

function extractAspects(text: string): { aspect: string; sentiment: string; score: number }[] {
    const lower = text.toLowerCase();
    const aspectKeywords: Record<string, string[]> = {
        'Service': ['service', 'staff', 'employee', 'team', 'crew', 'server', 'waiter', 'waitress', 'manager', 'receptionist'],
        'Food/Product': ['food', 'meal', 'dish', 'menu', 'taste', 'flavor', 'product', 'item', 'quality'],
        'Price': ['price', 'cost', 'expensive', 'cheap', 'affordable', 'value', 'worth', 'overpriced', 'reasonable'],
        'Cleanliness': ['clean', 'dirty', 'filthy', 'hygiene', 'sanitary', 'spotless', 'tidy', 'messy'],
        'Atmosphere': ['atmosphere', 'ambiance', 'vibe', 'decor', 'music', 'lighting', 'cozy', 'comfortable'],
        'Wait Time': ['wait', 'waited', 'slow', 'fast', 'quick', 'prompt', 'delay', 'hour', 'minutes'],
        'Location': ['location', 'parking', 'accessible', 'convenient', 'easy to find'],
        'Communication': ['communication', 'response', 'call', 'email', 'phone', 'contact', 'follow up'],
    };

    const results: { aspect: string; sentiment: string; score: number }[] = [];
    for (const [aspect, keywords] of Object.entries(aspectKeywords)) {
        const found = keywords.filter(k => lower.includes(k));
        if (found.length > 0) {
            // Get surrounding context sentiment
            let aspectScore = 0;
            for (const keyword of found) {
                const idx = lower.indexOf(keyword);
                const context = lower.substring(Math.max(0, idx - 40), Math.min(lower.length, idx + keyword.length + 40));
                const contextResult = quickScore(context);
                aspectScore += contextResult;
            }
            aspectScore /= found.length;
            results.push({
                aspect,
                sentiment: aspectScore > 0.3 ? 'positive' : aspectScore < -0.3 ? 'negative' : 'neutral',
                score: parseFloat(aspectScore.toFixed(2)),
            });
        }
    }
    return results;
}

function quickScore(text: string): number {
    let score = 0;
    const words = text.split(/\s+/);
    for (const word of words) {
        if (WORD_SCORES[word]) score += WORD_SCORES[word];
    }
    for (const [phrase, ps] of NEGATIVE_PHRASES) {
        if (text.includes(phrase)) score += ps;
    }
    for (const [phrase, ps] of POSITIVE_PHRASES) {
        if (text.includes(phrase)) score += ps;
    }
    return score;
}

// Readability metrics
export function computeReadability(text: string): { fleschKincaid: number; avgSentenceLength: number; avgWordLength: number } {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);

    const avgSentLen = sentences.length ? words.length / sentences.length : words.length;
    const avgSyllPerWord = words.length ? syllableCount / words.length : 1;
    const avgWordLen = words.length ? words.reduce((s, w) => s + w.length, 0) / words.length : 0;

    // Flesch-Kincaid Grade Level
    const fk = 0.39 * avgSentLen + 11.8 * avgSyllPerWord - 15.59;

    return {
        fleschKincaid: parseFloat(Math.max(0, fk).toFixed(1)),
        avgSentenceLength: parseFloat(avgSentLen.toFixed(1)),
        avgWordLength: parseFloat(avgWordLen.toFixed(1)),
    };
}

function countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 2) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
}
