/**
 * reviewAnalyzerCompute.ts
 * 
 * Compute functions for overview, sentiment, ratings, responses.
 */

import { analyzeSentiment, computeReadability, SentimentResult } from './sentimentEngine';
import {
    OverviewMetrics, SentimentMetrics, RatingMetrics, ResponseMetrics,
    ContentMetrics, LegitimacyMetrics, TemporalMetrics, ActionMetrics,
    CompetitiveMetrics, ReviewerMetrics, ReviewAnalysisResult
} from './reviewAnalyzerTypes';
import { ScrapedReview } from './reviewScraper';

export interface EnrichedReview extends ScrapedReview {
    sentimentResult: SentimentResult;
    sentimentScore: number;
    sentimentLabel: string;
    wordCount: number;
    fakeScore: number;
    fakeReasons: string[];
}

export function enrichReviews(reviews: ScrapedReview[]): EnrichedReview[] {
    return reviews.map(r => {
        const sentResult = analyzeSentiment(r.text, r.rating);
        const { score: fakeScore, reasons: fakeReasons } = calculateFakeScore(r, sentResult);
        return {
            ...r,
            sentimentResult: sentResult,
            sentimentScore: sentResult.compound,
            sentimentLabel: sentResult.label,
            wordCount: r.text ? r.text.split(/\s+/).length : 0,
            fakeScore,
            fakeReasons,
        };
    });
}

function calculateFakeScore(review: ScrapedReview, sentiment: SentimentResult): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    if (!review.text || review.text.trim().length === 0) { score += 15; reasons.push('No review text provided'); }
    else if (review.text.length < 20) { score += 10; reasons.push('Extremely short review text'); }



    if (review.reviewCount !== undefined && review.reviewCount <= 1) { score += 20; reasons.push('Single-review account (first/only review)'); }
    else if (review.reviewCount !== undefined && review.reviewCount <= 3) { score += 10; reasons.push('Very few total reviews on account'); }

    if (review.photoCount === 0) { score += 5; reasons.push('No photos shown on profile'); }

    if ((review.rating === 1 || review.rating === 5) && (!review.text || review.text.length < 30)) {
        score += 10; reasons.push('Extreme rating with minimal text');
    }

    if (review.text && review.text === review.text.toUpperCase() && review.text.length > 10) {
        score += 5; reasons.push('Entire review in ALL CAPS');
    }

    if (review.text) {
        const generic = ['great place', 'nice place', 'good', 'excellent', 'best place', 'highly recommend', 'wonderful place', 'amazing place'];
        const lower = review.text.toLowerCase().trim();
        if (generic.includes(lower) || (lower.length < 15 && review.rating === 5)) {
            score += 15; reasons.push('Generic/boilerplate review text');
        }
    }

    // Rating-text alignment check
    if (review.text && review.rating === 5 && sentiment.label === 'NEGATIVE') {
        score += 15; reasons.push('5-star rating but negative text sentiment (inconsistent)');
    }
    if (review.text && review.rating === 1 && sentiment.label === 'POSITIVE') {
        score += 15; reasons.push('1-star rating but positive text sentiment (inconsistent)');
    }

    // Duplicate/repetitive text check
    if (review.text) {
        const words = review.text.toLowerCase().split(/\s+/);
        const unique = new Set(words);
        if (words.length > 5 && unique.size / words.length < 0.5) {
            score += 10; reasons.push('Highly repetitive text');
        }
    }

    return { score: Math.min(score, 100), reasons };
}

export function computeOverview(reviews: EnrichedReview[]): OverviewMetrics {
    const avgRating = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const sorted = [...reviews].sort((a, b) => a.rating - b.rating);
    const median = sorted[Math.floor(sorted.length / 2)]?.rating || 0;
    const avgSentiment = reviews.reduce((s, r) => s + r.sentimentScore, 0) / reviews.length;
    const responseRate = reviews.filter(r => r.responseText).length / reviews.length * 100;
    const fakePercent = reviews.filter(r => r.fakeScore >= 50).length / reviews.length * 100;

    // NPS: promoters (4-5) minus detractors (1-2)
    const promoters = reviews.filter(r => r.rating >= 4).length / reviews.length * 100;
    const detractors = reviews.filter(r => r.rating <= 2).length / reviews.length * 100;
    const nps = Math.round(promoters - detractors);

    // Customer satisfaction index
    const csi = Math.round((avgRating / 5) * 100);

    // Review authenticity
    const authScore = Math.round(100 - fakePercent);

    // Engagement: response rate + review text rate
    const textRate = reviews.filter(r => r.text && r.text.length > 10).length / reviews.length * 100;
    const engagement = Math.round((responseRate * 0.5 + textRate * 0.5));

    // Health score
    let health = 50;
    health += (avgRating - 3) * 10;
    health += Math.min(avgSentiment * 15, 12);
    health += Math.min(responseRate / 4, 12);
    health -= fakePercent / 4;
    health += nps > 0 ? Math.min(nps / 10, 8) : Math.max(nps / 10, -8);
    health = Math.max(0, Math.min(100, health));

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const risks: string[] = [];

    if (avgRating >= 4.5) strengths.push('Exceptional average rating');
    else if (avgRating >= 4.0) strengths.push('Strong average rating');
    if (responseRate > 80) strengths.push('Excellent response rate');
    else if (responseRate > 50) strengths.push('Good response rate');
    if (avgSentiment > 0.15) strengths.push('Highly positive sentiment in reviews');
    if (fakePercent < 5) strengths.push('Very authentic review base');
    if (nps > 50) strengths.push('Outstanding Net Promoter Score');
    if (textRate > 70) strengths.push('High review detail (most reviews have text)');

    if (avgRating < 3.5) weaknesses.push('Below-average rating');
    if (responseRate < 30) weaknesses.push('Low response rate to reviews');
    if (avgSentiment < -0.05) weaknesses.push('Overall negative sentiment');
    if (nps < 0) weaknesses.push('Negative Net Promoter Score');
    if (textRate < 30) weaknesses.push('Most reviews lack detail (no text)');

    if (fakePercent > 20) risks.push(`${fakePercent.toFixed(0)}% of reviews flagged as potentially fake`);
    const negRate = reviews.filter(r => r.rating <= 2).length / reviews.length * 100;
    if (negRate > 20) risks.push(`${negRate.toFixed(0)}% of reviews are 1-2 stars`);
    const unrespondedNegs = reviews.filter(r => r.rating <= 2 && !r.responseText).length;
    if (unrespondedNegs > 3) risks.push(`${unrespondedNegs} negative reviews without owner response`);

    // Momentum
    const monthly = groupByMonth(reviews);
    const months = Object.keys(monthly).sort();
    let momentum = 'STABLE';
    if (months.length >= 6) {
        const recent = months.slice(-3);
        const older = months.slice(-6, -3);
        const recentAvg = recent.reduce((s, m) => s + (monthly[m] || []).reduce((ss: number, r: any) => ss + r.rating, 0) / (monthly[m] || []).length, 0) / recent.length;
        const olderAvg = older.reduce((s, m) => s + (monthly[m] || []).reduce((ss: number, r: any) => ss + r.rating, 0) / (monthly[m] || []).length, 0) / older.length;
        if (recentAvg > olderAvg + 0.2) momentum = 'RISING';
        else if (recentAvg < olderAvg - 0.2) momentum = 'FALLING';
    }

    const grade = health >= 90 ? 'A+' : health >= 80 ? 'A' : health >= 70 ? 'B+' :
        health >= 60 ? 'B' : health >= 50 ? 'C' : health >= 40 ? 'D' : 'F';

    return {
        healthScore: Math.round(health), totalReviews: reviews.length,
        averageRating: parseFloat(avgRating.toFixed(2)), ratingMedian: median,
        sentimentScore: parseFloat(avgSentiment.toFixed(3)),
        responseRate: parseFloat(responseRate.toFixed(1)),
        fakeReviewPercentage: parseFloat(fakePercent.toFixed(1)),
        strengthsSummary: strengths, weaknessesSummary: weaknesses, riskAlerts: risks,
        gradeLabel: grade, netPromoterScore: nps, customerSatisfactionIndex: csi,
        reviewAuthenticityScore: authScore, engagementScore: engagement,
        reputationMomentum: momentum,
    };
}

export function computeSentiment(reviews: EnrichedReview[]): SentimentMetrics {
    reviews = reviews.filter(r => r.sentimentLabel !== 'NOT_ASSESSED');
    if (!reviews.length) return { overallScore: 0, overallLabel: 'NOT_ASSESSED', positiveCount: 0, negativeCount: 0, neutralCount: 0, mixedCount: 0,
        averagePositiveIntensity: 0, averageNegativeIntensity: 0, sentimentTrend: [], mostPositiveReview: null, mostNegativeReview: null,
        emotionBreakdown: [], sentimentByRating: [], ratingTextAlignment: 0, sarcasmSuspectCount: 0, aspectSentiments: [] };
    const positive = reviews.filter(r => r.sentimentLabel === 'POSITIVE');
    const negative = reviews.filter(r => r.sentimentLabel === 'NEGATIVE');
    const neutral = reviews.filter(r => r.sentimentLabel === 'NEUTRAL');
    const mixed = reviews.filter(r => r.sentimentLabel === 'MIXED');

    const avgPos = positive.length ? positive.reduce((s, r) => s + r.sentimentScore, 0) / positive.length : 0;
    const avgNeg = negative.length ? negative.reduce((s, r) => s + Math.abs(r.sentimentScore), 0) / negative.length : 0;

    const sorted = [...reviews].filter(r => r.text).sort((a, b) => b.sentimentScore - a.sentimentScore);
    const mostPos = sorted[0] ? { text: sorted[0].text!.substring(0, 300), score: sorted[0].sentimentScore, reviewer: sorted[0].reviewerName } : null;
    const mostNeg = sorted.length > 0 ? { text: sorted[sorted.length - 1].text?.substring(0, 300) || '', score: sorted[sorted.length - 1].sentimentScore, reviewer: sorted[sorted.length - 1].reviewerName } : null;

    // Emotion breakdown
    const emotionCounts: Record<string, number> = {};
    reviews.forEach(r => {
        const emotion = r.sentimentResult.emotion;
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    });
    const emotionBreakdown = Object.entries(emotionCounts)
        .map(([emotion, count]) => ({ emotion, count, percentage: parseFloat((count / reviews.length * 100).toFixed(1)) }))
        .sort((a, b) => b.count - a.count);

    // Sentiment by rating
    const byRating: Record<number, number[]> = {};
    reviews.forEach(r => {
        if (!byRating[r.rating]) byRating[r.rating] = [];
        byRating[r.rating].push(r.sentimentScore);
    });
    const sentimentByRating = Object.entries(byRating).map(([rating, scores]) => ({
        rating: parseInt(rating),
        avgSentiment: parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(3)),
    })).sort((a, b) => a.rating - b.rating);

    // Rating-text alignment: how much do ratings match text sentiment?
    let aligned = 0;
    const textReviews = reviews.filter(r => r.text && r.text.length > 10);
    textReviews.forEach(r => {
        if ((r.rating >= 4 && r.sentimentLabel === 'POSITIVE') ||
            (r.rating <= 2 && r.sentimentLabel === 'NEGATIVE') ||
            (r.rating === 3 && (r.sentimentLabel === 'NEUTRAL' || r.sentimentLabel === 'MIXED'))) {
            aligned++;
        }
    });
    const ratingTextAlignment = textReviews.length ? Math.round(aligned / textReviews.length * 100) : 0;

    // Sarcasm suspect: positive text + low rating or negative text + high rating
    const sarcasmSuspect = textReviews.filter(r =>
        (r.rating >= 4 && r.sentimentLabel === 'NEGATIVE') || (r.rating <= 2 && r.sentimentLabel === 'POSITIVE')
    ).length;

    // Aspect sentiments aggregate
    const aspectAgg: Record<string, { positive: number; negative: number; neutral: number }> = {};
    reviews.forEach(r => {
        r.sentimentResult.aspects.forEach(a => {
            if (!aspectAgg[a.aspect]) aspectAgg[a.aspect] = { positive: 0, negative: 0, neutral: 0 };
            if (a.sentiment === 'positive') aspectAgg[a.aspect].positive++;
            else if (a.sentiment === 'negative') aspectAgg[a.aspect].negative++;
            else aspectAgg[a.aspect].neutral++;
        });
    });
    const aspectSentiments = Object.entries(aspectAgg).map(([aspect, data]) => ({ aspect, ...data }));

    // Sentiment trend
    const monthlyScores = groupByMonth(reviews);
    const sentimentTrend = Object.entries(monthlyScores).map(([period, revs]) => ({
        period,
        score: parseFloat((revs.reduce((s: number, r: any) => s + r.sentimentScore, 0) / revs.length).toFixed(3)),
    })).sort((a, b) => a.period.localeCompare(b.period));

    return {
        overallScore: parseFloat((reviews.reduce((s, r) => s + r.sentimentScore, 0) / reviews.length).toFixed(3)),
        overallLabel: avgPos > avgNeg ? 'POSITIVE' : avgNeg > avgPos ? 'NEGATIVE' : 'NEUTRAL',
        positiveCount: positive.length, negativeCount: negative.length,
        neutralCount: neutral.length, mixedCount: mixed.length,
        averagePositiveIntensity: parseFloat(avgPos.toFixed(3)),
        averageNegativeIntensity: parseFloat(avgNeg.toFixed(3)),
        sentimentTrend, mostPositiveReview: mostPos, mostNegativeReview: mostNeg,
        emotionBreakdown, sentimentByRating,
        ratingTextAlignment, sarcasmSuspectCount: sarcasmSuspect, aspectSentiments,
    };
}

export function computeRatings(reviews: EnrichedReview[]): RatingMetrics {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => { dist[r.rating] = (dist[r.rating] || 0) + 1; });

    const distribution = [1, 2, 3, 4, 5].map(rating => ({
        rating, count: dist[rating], percentage: parseFloat((dist[rating] / reviews.length * 100).toFixed(1)),
    }));

    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const variance = reviews.reduce((s, r) => s + Math.pow(r.rating - avg, 2), 0) / reviews.length;
    const stdDev = Math.sqrt(variance);

    const monthly = groupByMonth(reviews);
    const ratingTrend = Object.entries(monthly).map(([period, revs]) => ({
        period,
        avgRating: parseFloat((revs.reduce((s: number, r: any) => s + r.rating, 0) / revs.length).toFixed(2)),
        count: revs.length,
    })).sort((a, b) => a.period.localeCompare(b.period));

    const months = Object.keys(monthly).length || 1;
    const velocity = reviews.length / months;

    const recentMonths = ratingTrend.slice(-3);
    const olderMonths = ratingTrend.slice(0, Math.max(1, ratingTrend.length - 3));
    const recentAvg = recentMonths.length ? recentMonths.reduce((s, m) => s + m.avgRating, 0) / recentMonths.length : avg;
    const olderAvg = olderMonths.length ? olderMonths.reduce((s, m) => s + m.avgRating, 0) / olderMonths.length : avg;
    const delta = recentAvg - olderAvg;

    const trend = delta > 0.2 ? 'IMPROVING' : delta < -0.2 ? 'DECLINING' : 'STABLE';
    const extreme = (dist[1] + dist[5]) / reviews.length;

    const anomalies: { period: string; reason: string }[] = [];
    ratingTrend.forEach(m => {
        if (m.count > velocity * 3) anomalies.push({ period: m.period, reason: `Spike: ${m.count} reviews (avg: ${velocity.toFixed(0)})` });
        if (m.avgRating < avg - 1) anomalies.push({ period: m.period, reason: `Rating drop: ${m.avgRating} (avg: ${avg.toFixed(1)})` });
    });

    // Recency-weighted rating
    const now = Date.now();
    let weightedSum = 0, weightSum = 0;
    reviews.forEach((r, i) => {
        const weight = 1 + (i / reviews.length); // newer reviews get more weight
        weightedSum += r.rating * weight;
        weightSum += weight;
    });
    const weightedRating = weightSum ? weightedSum / weightSum : avg;

    // Bayesian average (IMDB formula): (v/(v+m)) * R + (m/(v+m)) * C
    const C = 3.5; // prior mean
    const m = 10;   // minimum votes
    const v = reviews.length;
    const R = avg;
    const bayesian = (v / (v + m)) * R + (m / (v + m)) * C;

    // Rating entropy
    const probs = distribution.map(d => d.count / reviews.length).filter(p => p > 0);
    const entropy = -probs.reduce((s, p) => s + p * Math.log2(p), 0);

    return {
        distribution, standardDeviation: parseFloat(stdDev.toFixed(2)), ratingTrend,
        ratingVelocity: parseFloat(velocity.toFixed(1)), improvingOrDeclining: trend,
        fiveStarRatio: parseFloat((dist[5] / reviews.length * 100).toFixed(1)),
        oneStarRatio: parseFloat((dist[1] / reviews.length * 100).toFixed(1)),
        polarizationIndex: parseFloat(extreme.toFixed(2)),
        recentVsOverallDelta: parseFloat(delta.toFixed(2)), anomalyPeriods: anomalies,
        weightedRating: parseFloat(weightedRating.toFixed(2)),
        bayesianAverage: parseFloat(bayesian.toFixed(2)),
        ratingEntropy: parseFloat(entropy.toFixed(3)),
    };
}

export function computeResponses(reviews: EnrichedReview[]): ResponseMetrics {
    const responded = reviews.filter(r => r.responseText);
    const negatives = reviews.filter(r => r.rating <= 2);
    const positives = reviews.filter(r => r.rating >= 4);

    const responseRate = (responded.length / reviews.length) * 100;
    const responseRateNeg = negatives.length ? negatives.filter(r => r.responseText).length / negatives.length * 100 : 0;
    const responseRatePos = positives.length ? positives.filter(r => r.responseText).length / positives.length * 100 : 0;
    const avgLen = responded.length ? responded.reduce((s, r) => s + (r.responseText?.length || 0), 0) / responded.length : 0;

    // Template detection
    const responseCounts: Record<string, number> = {};
    responded.forEach(r => {
        const normalized = r.responseText?.toLowerCase().trim().substring(0, 100) || '';
        responseCounts[normalized] = (responseCounts[normalized] || 0) + 1;
    });
    const templateCount = Object.values(responseCounts).filter(c => c > 2).reduce((s, c) => s + c, 0);
    const templateRate = responded.length ? (templateCount / responded.length) * 100 : 0;

    const empathyWords = ['sorry', 'apologize', 'understand', 'appreciate', 'thank you', 'grateful', 'value', 'care', 'concern', 'improve'];
    const resolutionWords = ['resolve', 'fix', 'address', 'correct', 'refund', 'replace', 'compensate', 'follow up', 'contact us', 'reach out'];
    const defensiveWords = ['actually', 'however', 'incorrect', 'wrong', 'false', 'untrue', 'never happened', 'disagree'];

    let empathyCount = 0, resolutionCount = 0, defensiveCount = 0, personalizedCount = 0;
    responded.forEach(r => {
        const lower = r.responseText?.toLowerCase() || '';
        if (empathyWords.some(w => lower.includes(w))) empathyCount++;
        if (resolutionWords.some(w => lower.includes(w))) resolutionCount++;
        if (defensiveWords.some(w => lower.includes(w))) defensiveCount++;
        if (lower.includes(r.reviewerName?.toLowerCase().split(' ')[0] || '___')) personalizedCount++;
    });

    const empathyScore = responded.length ? (empathyCount / responded.length) * 100 : 0;

    // Response quality composite
    const qualityScore = Math.round(
        (empathyScore * 0.3) +
        (responded.length ? (personalizedCount / responded.length * 100) * 0.2 : 0) +
        (Math.min(avgLen / 5, 20) * 0.2) +
        ((100 - templateRate) * 0.15) +
        ((100 - (responded.length ? defensiveCount / responded.length * 100 : 0)) * 0.15)
    );

    const respondedByRating = [1, 2, 3, 4, 5].map(rating => {
        const forRating = reviews.filter(r => r.rating === rating);
        return { rating, responseRate: forRating.length ? parseFloat((forRating.filter(r => r.responseText).length / forRating.length * 100).toFixed(1)) : 0 };
    });

    const unrespondedNegs = negatives.filter(r => !r.responseText).slice(0, 10).map(r => ({
        reviewer: r.reviewerName, text: r.text?.substring(0, 200) || 'No text',
        rating: r.rating, date: r.publishedDate || 'Unknown',
    }));

    return {
        totalResponses: responded.length,
        responseRate: parseFloat(responseRate.toFixed(1)),
        responseRateNegative: parseFloat(responseRateNeg.toFixed(1)),
        responseRatePositive: parseFloat(responseRatePos.toFixed(1)),
        averageResponseLength: Math.round(avgLen),
        templateDetectionRate: parseFloat(templateRate.toFixed(1)),
        empathyScore: Math.round(empathyScore),
        resolutionLanguageRate: responded.length ? parseFloat((resolutionCount / responded.length * 100).toFixed(1)) : 0,
        defensiveLanguageRate: responded.length ? parseFloat((defensiveCount / responded.length * 100).toFixed(1)) : 0,
        personalizedRate: responded.length ? parseFloat((personalizedCount / responded.length * 100).toFixed(1)) : 0,
        respondedByRating, unrespondedNegatives: unrespondedNegs,
        averageResponseTime: 'N/A',
        responseQualityScore: Math.min(100, Math.max(0, qualityScore)),
    };
}

// Utility
export function groupByMonth(reviews: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    reviews.forEach(r => {
        const month = parseRelativeDate(r.publishedDate);
        if (!groups[month]) groups[month] = [];
        groups[month].push(r);
    });
    return groups;
}

export function parseRelativeDate(dateStr?: string): string {
    if (!dateStr) return 'Unknown';
    const now = new Date();
    const lower = dateStr.toLowerCase();

    const yearsMatch = lower.match(/(\d+)\s*year/);
    const monthsMatch = lower.match(/(\d+)\s*month/);
    const weeksMatch = lower.match(/(\d+)\s*week/);
    const daysMatch = lower.match(/(\d+)\s*day/);

    let targetDate = new Date(now);

    if (lower.includes('a year ago') || lower.includes('1 year ago')) targetDate.setFullYear(now.getFullYear() - 1);
    else if (yearsMatch) targetDate.setFullYear(now.getFullYear() - parseInt(yearsMatch[1]));
    else if (lower.includes('a month ago') || lower.includes('1 month ago')) targetDate.setMonth(now.getMonth() - 1);
    else if (monthsMatch) targetDate.setMonth(now.getMonth() - parseInt(monthsMatch[1]));
    else if (weeksMatch) targetDate.setDate(now.getDate() - parseInt(weeksMatch[1]) * 7);
    else if (daysMatch) targetDate.setDate(now.getDate() - parseInt(daysMatch[1]));
    else if (lower.includes('a week ago')) targetDate.setDate(now.getDate() - 7);

    return `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
}
