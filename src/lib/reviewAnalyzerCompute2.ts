/**
 * reviewAnalyzerCompute2.ts
 * 
 * Compute functions for: content, legitimacy, temporal, actions, competitive, reviewer.
 */

import { computeReadability } from './sentimentEngine';
import {
    ContentMetrics, LegitimacyMetrics, TemporalMetrics, ActionMetrics,
    CompetitiveMetrics, ReviewerMetrics, ReviewAnalysisResult
} from './reviewAnalyzerTypes';
import { EnrichedReview, groupByMonth } from './reviewAnalyzerCompute';

// ============================================================
// CONTENT
// ============================================================

export function computeContent(reviews: EnrichedReview[]): ContentMetrics {
    const textReviews = reviews.filter(r => r.text && r.text.trim().length > 0);

    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'up', 'down', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them', 'their', 'what', 'which', 'who', 'when', 'where', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'or', 'if', 'while', 'because', 'about', 'get', 'got', 'also', 'back', 'even', 'well', 'way', 'much', 'here', 'there', 'really', 'like', 'will', 'go', 'going', 'one', 'two', 'first', 'time', 'new', 'now', 'come', 'came', 'make', 'made', 'give', 'over', 'know', 'been', 'its', 'then', 'them', 'her', 'him', 'his', 'she', 'any', 'own', 'say', 'said', 'thing', 'dont', 'didnt', 'ive', 'ill', 'lets', 'let', 'still', 'ever', 'yet']);

    // Keyword extraction
    const wordCounts: Record<string, { count: number; sentimentSum: number }> = {};
    const allWords: string[] = [];
    textReviews.forEach(r => {
        const words = r.text!.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
        words.forEach(w => {
            allWords.push(w);
            if (!wordCounts[w]) wordCounts[w] = { count: 0, sentimentSum: 0 };
            wordCounts[w].count++;
            wordCounts[w].sentimentSum += r.sentimentScore;
        });
    });

    const topKeywords = Object.entries(wordCounts)
        .sort((a, b) => b[1].count - a[1].count).slice(0, 40)
        .map(([word, data]) => ({ word, count: data.count, sentiment: data.sentimentSum > 0.5 ? 'positive' : data.sentimentSum < -0.5 ? 'negative' : 'neutral' }));

    // Bigrams
    const bigramCounts: Record<string, number> = {};
    textReviews.forEach(r => {
        const words = r.text!.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
        for (let i = 0; i < words.length - 1; i++) bigramCounts[`${words[i]} ${words[i + 1]}`] = (bigramCounts[`${words[i]} ${words[i + 1]}`] || 0) + 1;
    });
    const topPhrases = Object.entries(bigramCounts).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([phrase, count]) => ({ phrase, count }));

    // Trigrams
    const trigramCounts: Record<string, number> = {};
    textReviews.forEach(r => {
        const words = r.text!.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
        for (let i = 0; i < words.length - 2; i++) trigramCounts[`${words[i]} ${words[i + 1]} ${words[i + 2]}`] = (trigramCounts[`${words[i]} ${words[i + 1]} ${words[i + 2]}`] || 0) + 1;
    });
    const trigrams = Object.entries(trigramCounts).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([phrase, count]) => ({ phrase, count }));

    // Themes
    const complaintKeywords: Record<string, string[]> = {
        'Wait Times': ['wait', 'waited', 'slow', 'long', 'forever', 'delay', 'took forever', 'hours'],
        'Customer Service': ['rude', 'unfriendly', 'ignored', 'unprofessional', 'attitude', 'dismissive', 'disrespectful'],
        'Quality': ['poor', 'broken', 'defective', 'cheap', 'flimsy', 'subpar', 'poor quality'],
        'Cleanliness': ['dirty', 'filthy', 'messy', 'unclean', 'unsanitary', 'smell', 'gross'],
        'Pricing': ['expensive', 'overpriced', 'ripoff', 'overcharged', 'not worth', 'price gouging'],
        'Communication': ['no response', 'never called', 'unreachable', 'ghosted', 'voicemail'],
        'Dishonesty': ['bait and switch', 'lied', 'misleading', 'false', 'scam', 'fraud', 'deceptive'],
        'Safety': ['unsafe', 'dangerous', 'hazard', 'health', 'injury', 'accident'],
    };
    const praiseKeywords: Record<string, string[]> = {
        'Service Quality': ['excellent', 'amazing', 'outstanding', 'exceptional', 'fantastic', 'wonderful', 'superb'],
        'Staff': ['friendly', 'helpful', 'kind', 'polite', 'knowledgeable', 'patient', 'caring'],
        'Value': ['great value', 'worth', 'reasonable', 'fair price', 'affordable', 'good deal', 'worth every penny'],
        'Atmosphere': ['welcoming', 'cozy', 'comfortable', 'clean', 'beautiful', 'nice ambiance', 'inviting'],
        'Expertise': ['professional', 'expert', 'skilled', 'experienced', 'talented', 'thorough'],
        'Reliability': ['reliable', 'dependable', 'consistent', 'trustworthy', 'on time', 'punctual'],
        'Results': ['perfect', 'exceeded', 'impressed', 'blown away', 'above and beyond', 'transformed'],
    };

    const complaints = extractThemes(textReviews.filter(r => r.rating <= 2), complaintKeywords);
    const praises = extractThemes(textReviews.filter(r => r.rating >= 4), praiseKeywords);

    const wordCnts = textReviews.map(r => r.wordCount);
    const avgWordCount = wordCnts.length ? wordCnts.reduce((s, c) => s + c, 0) / wordCnts.length : 0;
    const sortedWC = [...wordCnts].sort((a, b) => a - b);
    const medianWC = sortedWC[Math.floor(sortedWC.length / 2)] || 0;

    // Readability
    const allText = textReviews.map(r => r.text!).join('. ');
    const readability = allText.length > 0 ? computeReadability(allText) : { fleschKincaid: 0, avgSentenceLength: 0, avgWordLength: 0 };

    // Language quality
    let totalQuality = 0;
    textReviews.forEach(r => {
        let q = 50;
        if (r.wordCount > 20) q += 15; if (r.wordCount > 50) q += 10;
        if (r.text!.includes('.') || r.text!.includes(',')) q += 10;
        if (r.text !== r.text!.toUpperCase()) q += 5;
        if (/[!?]{3,}/.test(r.text!)) q -= 10;
        totalQuality += Math.min(100, Math.max(0, q));
    });

    // Unique word ratio
    const uniqueWords = new Set(allWords);
    const uniqueWordRatio = allWords.length ? uniqueWords.size / allWords.length : 0;

    const questionCount = textReviews.filter(r => r.text!.includes('?')).length;
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const emojiCount = textReviews.filter(r => emojiRegex.test(r.text!)).length;

    // Staff mentions
    const namePattern = /\b([A-Z][a-z]{2,})\b/g;
    const nameCounts: Record<string, number> = {};
    const skipNames = new Set(['The', 'This', 'They', 'Thank', 'Thanks', 'Great', 'Good', 'Would', 'Will', 'Very', 'Not', 'Amazing', 'Excellent', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Google', 'Yelp']);
    textReviews.forEach(r => {
        const matches = r.text!.match(namePattern);
        if (matches) matches.forEach((name: string) => { if (!skipNames.has(name) && name.length < 15) nameCounts[name] = (nameCounts[name] || 0) + 1; });
    });
    const mentionedStaff = Object.entries(nameCounts).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name]) => name);

    // Services mentioned
    const servicesMentioned = extractServiceMentions(textReviews);

    // Competitor mentions
    const competitorMentions = extractCompetitorMentions(textReviews);

    return {
        topKeywords, topPhrases, complaintThemes: complaints, praiseThemes: praises,
        averageWordCount: Math.round(avgWordCount), medianWordCount: medianWC,
        longReviewsCount: textReviews.filter(r => r.wordCount > 100).length,
        shortReviewsCount: textReviews.filter(r => r.wordCount < 10).length,
        languageQualityScore: textReviews.length ? Math.round(totalQuality / textReviews.length) : 0,
        questionCount, emojiUsageRate: textReviews.length ? parseFloat((emojiCount / textReviews.length * 100).toFixed(1)) : 0,
        mentionedStaff, readabilityScore: readability.fleschKincaid,
        averageSentenceLength: readability.avgSentenceLength,
        uniqueWordRatio: parseFloat(uniqueWordRatio.toFixed(3)),
        trigrams, servicesMentioned, competitorMentions,
    };
}

function extractServiceMentions(reviews: EnrichedReview[]): { service: string; count: number; sentiment: string }[] {
    const servicePatterns: Record<string, string[]> = {
        'Installation': ['install', 'installation', 'setup', 'set up', 'mounting'],
        'Repair': ['repair', 'fix', 'fixed', 'fixing', 'restoration', 'restore'],
        'Consultation': ['consult', 'consultation', 'advice', 'recommend', 'estimate', 'quote'],
        'Delivery': ['deliver', 'delivery', 'shipping', 'arrived', 'package'],
        'Maintenance': ['maintenance', 'upkeep', 'inspection', 'check', 'tune'],
        'Support': ['support', 'help', 'assist', 'assistance', 'customer service'],
    };
    const results: { service: string; count: number; sentiment: string }[] = [];
    for (const [service, keywords] of Object.entries(servicePatterns)) {
        let count = 0, sentSum = 0;
        reviews.forEach(r => {
            const lower = r.text?.toLowerCase() || '';
            if (keywords.some(k => lower.includes(k))) { count++; sentSum += r.sentimentScore; }
        });
        if (count >= 2) results.push({ service, count, sentiment: sentSum > 0.3 ? 'positive' : sentSum < -0.3 ? 'negative' : 'neutral' });
    }
    return results.sort((a, b) => b.count - a.count);
}

function extractCompetitorMentions(reviews: EnrichedReview[]): string[] {
    const competitorIndicators = ['better than', 'worse than', 'compared to', 'unlike', 'switched from', 'went to', 'used to go to', 'prefer', 'instead of'];
    const mentions: string[] = [];
    reviews.forEach(r => {
        if (!r.text) return;
        const lower = r.text.toLowerCase();
        competitorIndicators.forEach(ind => {
            const idx = lower.indexOf(ind);
            if (idx !== -1) {
                const after = r.text!.substring(idx + ind.length, idx + ind.length + 40).trim();
                const name = after.split(/[,.!?\n]/)[0]?.trim();
                if (name && name.length > 2 && name.length < 30) mentions.push(name);
            }
        });
    });
    return [...new Set(mentions)].slice(0, 10);
}

// ============================================================
// LEGITIMACY
// ============================================================

export function computeLegitimacy(reviews: EnrichedReview[]): LegitimacyMetrics {
    const suspicious = reviews.filter(r => r.fakeScore >= 50);
    const oneReviewOnly = reviews.filter(r => r.reviewCount !== undefined && r.reviewCount <= 1);
    const noText = reviews.filter(r => !r.text || r.text.trim().length === 0);
    const lowEffort = reviews.filter(r => r.wordCount < 5);
    const photoless = reviews.filter(r => !r.photoCount || r.photoCount === 0);


    // Velocity spikes
    const monthly = groupByMonth(reviews);
    const avgMonthly = reviews.length / Math.max(Object.keys(monthly).length, 1);
    const spikes = Object.entries(monthly)
        .filter(([, revs]) => revs.length > avgMonthly * 2.5)
        .map(([period, revs]) => ({ period, count: revs.length, normal: Math.round(avgMonthly) }));

    // Suspicious patterns
    const patterns: string[] = [];
    if (oneReviewOnly.length / reviews.length > 0.4) patterns.push(`${(oneReviewOnly.length / reviews.length * 100).toFixed(0)}% of reviewers have only 1 review`);
    if (noText.length / reviews.length > 0.3) patterns.push(`${(noText.length / reviews.length * 100).toFixed(0)}% of reviews have no text`);
    if (spikes.length > 2) patterns.push(`${spikes.length} unusual review volume spikes detected`);

    // Duplicate content detection
    const textHashes: Record<string, number> = {};
    reviews.forEach(r => {
        if (r.text && r.text.length > 20) {
            const hash = r.text.toLowerCase().trim().substring(0, 80);
            textHashes[hash] = (textHashes[hash] || 0) + 1;
        }
    });
    const duplicateContentCount = Object.values(textHashes).filter(c => c > 1).reduce((s, c) => s + c, 0);
    if (duplicateContentCount > 2) patterns.push(`${duplicateContentCount} reviews with duplicate/near-duplicate text`);

    // Reviewer diversity (Shannon entropy)
    const reviewerCounts: Record<string, number> = {};
    reviews.forEach(r => { reviewerCounts[r.reviewerName] = (reviewerCounts[r.reviewerName] || 0) + 1; });
    const probs = Object.values(reviewerCounts).map(c => c / reviews.length);
    const diversity = probs.length > 1 ? -probs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0) / Math.log2(probs.length) : 0;

    // Average reviewer experience
    const avgExperience = reviews.filter(r => r.reviewCount !== undefined).length > 0
        ? reviews.filter(r => r.reviewCount !== undefined).reduce((s, r) => s + (r.reviewCount || 0), 0) / reviews.filter(r => r.reviewCount !== undefined).length
        : 0;

    // Fake score distribution
    const fakeRanges: Record<string, number> = { '0-20 (Likely Real)': 0, '21-40 (Low Risk)': 0, '41-60 (Medium Risk)': 0, '61-80 (High Risk)': 0, '81-100 (Likely Fake)': 0 };
    reviews.forEach(r => {
        if (r.fakeScore <= 20) fakeRanges['0-20 (Likely Real)']++;
        else if (r.fakeScore <= 40) fakeRanges['21-40 (Low Risk)']++;
        else if (r.fakeScore <= 60) fakeRanges['41-60 (Medium Risk)']++;
        else if (r.fakeScore <= 80) fakeRanges['61-80 (High Risk)']++;
        else fakeRanges['81-100 (Likely Fake)']++;
    });

    // Top suspicious with detailed reasons
    const topSuspicious = [...reviews]
        .sort((a, b) => b.fakeScore - a.fakeScore)
        .slice(0, 10)
        .filter(r => r.fakeScore >= 35)
        .map(r => ({
            reviewer: r.reviewerName,
            rating: r.rating,
            text: r.text?.substring(0, 200) || 'No text',
            score: r.fakeScore,
            reasons: r.fakeReasons,
        }));

    const trustScore = Math.max(0, Math.min(100, 100 - (suspicious.length / reviews.length * 100)));

    return {
        overallTrustScore: Math.round(trustScore), totalSuspicious: suspicious.length,
        suspiciousPercentage: parseFloat((suspicious.length / reviews.length * 100).toFixed(1)),
        noProfileReviewers: oneReviewOnly.length,
        oneReviewOnly: oneReviewOnly.length,
        oneReviewPercentage: parseFloat((oneReviewOnly.length / reviews.length * 100).toFixed(1)),
        lowEffortReviews: lowEffort.length, lowEffortPercentage: parseFloat((lowEffort.length / reviews.length * 100).toFixed(1)),
        ratingOnlyReviews: noText.length, ratingOnlyPercentage: parseFloat((noText.length / reviews.length * 100).toFixed(1)),
        photolessReviewers: photoless.length, photolessPercentage: parseFloat((photoless.length / reviews.length * 100).toFixed(1)),
        velocitySpikes: spikes, suspiciousPatterns: patterns,
        fakeScoreDistribution: Object.entries(fakeRanges).map(([range, count]) => ({ range, count })),
        topSuspiciousReviews: topSuspicious,
        reviewerDiversityIndex: parseFloat(diversity.toFixed(3)),
        duplicateContentCount, averageReviewerExperience: parseFloat(avgExperience.toFixed(1)),
    };
}

// ============================================================
// TEMPORAL
// ============================================================

export function computeTemporal(reviews: EnrichedReview[]): TemporalMetrics {
    const monthly = groupByMonth(reviews);
    const reviewsPerMonth = Object.entries(monthly)
        .map(([month, revs]) => ({ month, count: revs.length }))
        .sort((a, b) => a.month.localeCompare(b.month));

    const monthCounts = reviewsPerMonth.map(m => m.count);
    const avgPerMonth = monthCounts.length ? monthCounts.reduce((s, c) => s + c, 0) / monthCounts.length : 0;

    const busiest = reviewsPerMonth.reduce((max, m) => m.count > max.count ? m : max, { month: 'N/A', count: 0 });
    const slowest = reviewsPerMonth.reduce((min, m) => m.count < min.count ? m : min, { month: 'N/A', count: Infinity });

    const last3 = reviewsPerMonth.slice(-3);
    const prev3 = reviewsPerMonth.slice(-6, -3);
    const recentAvg = last3.length ? last3.reduce((s, m) => s + m.count, 0) / last3.length : 0;
    const prevAvg = prev3.length ? prev3.reduce((s, m) => s + m.count, 0) / prev3.length : 0;
    const recentTrend = recentAvg > prevAvg * 1.2 ? 'ACCELERATING' : recentAvg < prevAvg * 0.8 ? 'DECELERATING' : 'STEADY';

    let recencyScore = 50;
    if (last3.length && recentAvg > 2) recencyScore = 80;
    if (last3.length && recentAvg > 5) recencyScore = 95;
    if (last3.length && recentAvg < 1) recencyScore = 30;

    const burstPeriods = reviewsPerMonth
        .filter(m => m.count > avgPerMonth * 2)
        .map(m => ({ period: m.month, count: m.count, avgMonthly: parseFloat(avgPerMonth.toFixed(1)) }));

    // Growth rate
    const growthRate = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;

    const firstDate = reviewsPerMonth.length ? reviewsPerMonth[0].month : 'N/A';
    const lastDate = reviewsPerMonth.length ? reviewsPerMonth[reviewsPerMonth.length - 1].month : 'N/A';
    const lifespan = reviewsPerMonth.length;

    // Day of week approximation
    const dayDist = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({ day, count: 0 }));

    return {
        reviewsPerMonth, averageReviewsPerMonth: parseFloat(avgPerMonth.toFixed(1)),
        busiestMonth: busiest.month, slowestMonth: slowest.count === Infinity ? 'N/A' : slowest.month,
        longestGap: null, recentTrend, dayOfWeekDistribution: dayDist,
        recencyScore, burstPeriods, seasonalPattern: null,
        firstReviewDate: firstDate, lastReviewDate: lastDate,
        reviewLifespan: lifespan, growthRate: parseFloat(growthRate.toFixed(1)),
    };
}

// ============================================================
// ACTIONS
// ============================================================

export function computeActions(reviews: EnrichedReview[], metrics: Omit<ReviewAnalysisResult, 'actions' | 'competitive' | 'reviewer'>): ActionMetrics {
    const issues: ActionMetrics['priorityIssues'] = [];
    const actions: ActionMetrics['recommendedActions'] = [];
    const quickWins: string[] = [];
    const longTerm: string[] = [];

    if (metrics.responses.responseRateNegative < 50) {
        issues.push({ issue: 'Low negative review response rate', severity: 'HIGH', evidence: `Only ${metrics.responses.responseRateNegative}% of 1-2 star reviews have responses`, suggestion: 'Respond to all negative reviews within 24 hours with personalized, empathetic messages.' });
        actions.push({ action: 'Set up daily review monitoring', priority: 'HIGH', impact: 'Improves perception and may recover lost customers' });
        quickWins.push('Respond to all unanswered negative reviews this week');
    }

    if (metrics.responses.templateDetectionRate > 30) {
        issues.push({ issue: 'Too many template responses', severity: 'MEDIUM', evidence: `${metrics.responses.templateDetectionRate}% of responses appear copy-pasted`, suggestion: 'Reference specific details from each review in your response.' });
        quickWins.push('Rewrite template responses with personalized touches');
    }

    if (metrics.responses.defensiveLanguageRate > 20) {
        issues.push({ issue: 'Defensive language in responses', severity: 'HIGH', evidence: `${metrics.responses.defensiveLanguageRate}% of responses contain defensive tone`, suggestion: 'Lead with empathy and acknowledgment, not correction.' });
    }

    if (metrics.ratings.oneStarRatio > 15) {
        issues.push({ issue: 'High 1-star concentration', severity: 'HIGH', evidence: `${metrics.ratings.oneStarRatio}% of reviews are 1-star`, suggestion: 'Analyze 1-star reviews for recurring themes and address root causes.' });
        longTerm.push('Conduct root cause analysis of all 1-star reviews');
    }

    if (metrics.ratings.improvingOrDeclining === 'DECLINING') {
        issues.push({ issue: 'Rating trend declining', severity: 'CRITICAL', evidence: `Recent ratings ${metrics.ratings.recentVsOverallDelta.toFixed(2)} points lower than overall`, suggestion: 'Investigate recent operational changes causing quality drops.' });
        actions.push({ action: 'Conduct internal quality audit', priority: 'URGENT', impact: 'May halt further decline' });
    }

    if (metrics.legitimacy.suspiciousPercentage > 15) {
        issues.push({ issue: 'Suspicious review activity', severity: 'MEDIUM', evidence: `${metrics.legitimacy.suspiciousPercentage}% flagged as potentially inauthentic`, suggestion: 'Report suspicious reviews to Google.' });
    }

    if (metrics.content.complaintThemes.length > 0) {
        const top = metrics.content.complaintThemes[0];
        issues.push({ issue: `Recurring complaint: ${top.theme}`, severity: 'MEDIUM', evidence: `Mentioned in ${top.count} negative reviews`, suggestion: `Address "${top.theme}" systematically.` });
        longTerm.push(`Create action plan to address ${top.theme}`);
    }

    if (metrics.overview.responseRate < 50) {
        actions.push({ action: 'Aim to respond to 100% of reviews', priority: 'HIGH', impact: 'Shows engagement to potential customers' });
    }

    if (metrics.overview.netPromoterScore < 20) {
        longTerm.push('Implement customer satisfaction program to improve NPS');
    }

    if (metrics.sentiment.ratingTextAlignment < 60) {
        issues.push({ issue: 'Low rating-text alignment', severity: 'LOW', evidence: `Only ${metrics.sentiment.ratingTextAlignment}% of ratings match text sentiment`, suggestion: 'This may indicate review manipulation or sarcasm in reviews.' });
    }

    actions.push({ action: 'Encourage happy customers to leave reviews', priority: 'MEDIUM', impact: 'Dilutes negative reviews' });
    actions.push({ action: 'Share positive reviews on social media', priority: 'LOW', impact: 'Builds social proof' });

    quickWins.push('Ask your top 5 most recent satisfied customers for a review');
    longTerm.push('Build systematic review request process into customer journey');

    // Suggested responses — context-aware
    const suggestedResponses = metrics.responses.unrespondedNegatives.slice(0, 5).map(r => {
        const enrichedReview = reviews.find(rv => rv.reviewerName === r.reviewer && rv.rating === r.rating);
        const sentLabel = enrichedReview?.sentimentLabel || 'NEGATIVE';
        return {
            reviewerName: r.reviewer,
            reviewText: r.text,
            rating: r.rating,
            sentiment: sentLabel,
            suggestedResponse: generateSmartResponse(r, enrichedReview),
        };
    });

    const overallRec = metrics.overview.healthScore >= 80
        ? 'Your review profile is strong. Focus on maintaining quality and encouraging more reviews.'
        : metrics.overview.healthScore >= 60
            ? 'Room for improvement. Prioritize responding to negatives and addressing recurring complaints.'
            : 'Urgent attention needed. Focus on service quality, responding to all reviews, and fixing identified issues.';

    return { priorityIssues: issues, recommendedActions: actions, suggestedResponses, overallRecommendation: overallRec, quickWins, longTermStrategies: longTerm };
}

function generateSmartResponse(review: { reviewer: string; text: string; rating: number }, enriched?: EnrichedReview): string {
    const name = review.reviewer.split(' ')[0] || 'there';
    const negWords = enriched?.sentimentResult?.negativeWords || [];
    const aspects = enriched?.sentimentResult?.aspects || [];

    const negativeAspects = aspects.filter(a => a.sentiment === 'negative').map(a => a.aspect);
    const specificIssue = negativeAspects.length > 0 ? negativeAspects[0].toLowerCase() : negWords.length > 0 ? negWords[0] : null;

    if (review.rating <= 2) {
        let response = `Dear ${name}, thank you for bringing this to our attention. We sincerely apologize for your experience`;
        if (specificIssue) response += ` regarding ${specificIssue}`;
        response += `. This falls short of the standards we hold ourselves to. We take your feedback very seriously and are already looking into this matter. We would greatly appreciate the opportunity to make things right — please contact us directly at your earliest convenience so we can address your concerns personally. Your satisfaction is our top priority.`;
        return response;
    }
    if (review.rating === 3) {
        return `Thank you for your honest feedback, ${name}. We appreciate you taking the time to share your experience. We're always looking to improve${specificIssue ? ` and will review your comments about ${specificIssue}` : ''}. We hope to exceed your expectations on your next visit.`;
    }
    return `Thank you for your review, ${name}! We appreciate your feedback and are glad you chose us.`;
}

// ============================================================
// COMPETITIVE & REVIEWER
// ============================================================

export function computeCompetitive(reviews: EnrichedReview[], overview: any): CompetitiveMetrics {
    const benchmarks: CompetitiveMetrics['industryBenchmark'] = [
        { metric: 'Average Rating', yours: overview.averageRating, benchmark: 4.2, verdict: overview.averageRating >= 4.2 ? 'Above Average' : 'Below Average' },
        { metric: 'Response Rate', yours: overview.responseRate, benchmark: 30, verdict: overview.responseRate >= 30 ? 'Above Average' : 'Below Average' },
        { metric: 'Review Pattern indicator', yours: overview.reviewAuthenticityScore, benchmark: 85, verdict: overview.reviewAuthenticityScore >= 85 ? 'Healthy' : 'Needs Attention' },
        { metric: 'Net Promoter Score', yours: overview.netPromoterScore, benchmark: 30, verdict: overview.netPromoterScore >= 30 ? 'Strong' : overview.netPromoterScore >= 0 ? 'Average' : 'Weak' },
        { metric: 'Engagement Score', yours: overview.engagementScore, benchmark: 50, verdict: overview.engagementScore >= 50 ? 'Good' : 'Needs Improvement' },
    ];

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    benchmarks.forEach(b => {
        if (b.yours >= b.benchmark * 1.1) strengths.push(`${b.metric} is ${((b.yours / b.benchmark - 1) * 100).toFixed(0)}% above industry average`);
        if (b.yours < b.benchmark * 0.8) weaknesses.push(`${b.metric} is ${((1 - b.yours / b.benchmark) * 100).toFixed(0)}% below industry average`);
    });

    const positioning = overview.healthScore >= 80 ? 'Market Leader' : overview.healthScore >= 60 ? 'Competitive' : overview.healthScore >= 40 ? 'Average' : 'Below Market';

    return { industryBenchmark: benchmarks, strengthsVsCompetitors: strengths, weaknessesVsCompetitors: weaknesses, marketPositioning: positioning };
}

export function computeReviewer(reviews: EnrichedReview[]): ReviewerMetrics {
    const reviewerMap: Record<string, { count: number; totalRating: number }> = {};
    reviews.forEach(r => {
        if (!reviewerMap[r.reviewerName]) reviewerMap[r.reviewerName] = { count: 0, totalRating: 0 };
        reviewerMap[r.reviewerName].count++;
        reviewerMap[r.reviewerName].totalRating += r.rating;
    });

    const avgReviewsPerReviewer = Object.keys(reviewerMap).length ? reviews.length / Object.keys(reviewerMap).length : 0;
    const avgPhotos = reviews.filter(r => r.photoCount !== undefined).length > 0
        ? reviews.reduce((s, r) => s + (r.photoCount || 0), 0) / reviews.length : 0;

    const topReviewers = Object.entries(reviewerMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([name, data]) => ({ name, reviewCount: data.count, avgRating: parseFloat((data.totalRating / data.count).toFixed(1)) }));

    const returning = Object.values(reviewerMap).filter(r => r.count > 1).length;

    const loyaltyIndicators: string[] = [];
    if (returning > 0) loyaltyIndicators.push(`${returning} reviewer(s) left multiple reviews (updated or returned)`);
    if (avgReviewsPerReviewer > 1.1) loyaltyIndicators.push('Some reviewers have visited multiple times');

    return { averageReviewsPerReviewer: parseFloat(avgReviewsPerReviewer.toFixed(2)), averagePhotosPerReviewer: parseFloat(avgPhotos.toFixed(1)), topReviewers, returningReviewers: returning, reviewerLoyaltyIndicators: loyaltyIndicators };
}

// Utility
function extractThemes(reviews: EnrichedReview[], themeKeywords: Record<string, string[]>): { theme: string; count: number; examples: string[] }[] {
    const themeCounts: Record<string, { count: number; examples: string[] }> = {};
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
        themeCounts[theme] = { count: 0, examples: [] };
        reviews.forEach(r => {
            if (r.text) {
                const lower = r.text.toLowerCase();
                if (keywords.some(k => lower.includes(k))) {
                    themeCounts[theme].count++;
                    if (themeCounts[theme].examples.length < 3) themeCounts[theme].examples.push(r.text.substring(0, 150));
                }
            }
        });
    }
    return Object.entries(themeCounts).filter(([, d]) => d.count > 0).sort((a, b) => b[1].count - a[1].count).map(([theme, d]) => ({ theme, count: d.count, examples: d.examples }));
}
