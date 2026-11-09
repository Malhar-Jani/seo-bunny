/**
 * reviewAnalyzer.ts
 * 
 * Deep Analysis Engine v2 — 150+ metrics across 10 categories.
 * 
 * Architecture:
 * - sentimentEngine.ts      → Hybrid VADER/AFINN sentiment with phrase detection
 * - reviewAnalyzerTypes.ts   → All type definitions
 * - reviewAnalyzerCompute.ts → Overview, Sentiment, Ratings, Responses
 * - reviewAnalyzerCompute2.ts → Content, Legitimacy, Temporal, Actions, Competitive, Reviewer
 * - reviewAnalyzer.ts (this) → Entry point, deduplication, orchestration
 */

import { ScrapedReview } from './reviewScraper';
import { ReviewAnalysisResult } from './reviewAnalyzerTypes';
import { enrichReviews, computeOverview, computeSentiment, computeRatings, computeResponses } from './reviewAnalyzerCompute';
import { computeContent, computeLegitimacy, computeTemporal, computeActions, computeCompetitive, computeReviewer } from './reviewAnalyzerCompute2';

// Re-export types
export type { ReviewAnalysisResult } from './reviewAnalyzerTypes';

/**
 * Main entry point — analyzes reviews with full deduplication.
 */
export function analyzeReviews(reviews: ScrapedReview[]): ReviewAnalysisResult {
    if (!reviews || reviews.length === 0) {
        return getEmptyAnalysis();
    }

    // Step 1: Deduplicate reviews
    const deduplicated = deduplicateReviews(reviews);
    console.log(`[ReviewAnalyzer] ${reviews.length} reviews → ${deduplicated.length} after dedup`);

    // Step 2: Enrich with sentiment + fake scores  
    const enriched = enrichReviews(deduplicated);

    // Step 3: Compute all metrics
    const overview = computeOverview(enriched);
    const sentiment = computeSentiment(enriched);
    const ratings = computeRatings(enriched);
    const responses = computeResponses(enriched);
    const legitimacy = computeLegitimacy(enriched);
    const content = computeContent(enriched);
    const temporal = computeTemporal(enriched);
    const competitive = computeCompetitive(enriched, overview);
    const reviewer = computeReviewer(enriched);
    const actions = computeActions(enriched, { overview, sentiment, ratings, responses, legitimacy, content, temporal });

    return { overview, sentiment, ratings, responses, legitimacy, content, temporal, actions, competitive, reviewer };
}

/**
 * Deduplicates reviews by reviewer name + rating + text similarity.
 * Keeps the most recent version if duplicates exist.
 */
function deduplicateReviews(reviews: ScrapedReview[]): ScrapedReview[] {
    const seen = new Map<string, ScrapedReview>();

    for (const review of reviews) {
        // Create a fingerprint: reviewer name + rating + first 50 chars of text
        const textFingerprint = review.text
            ? review.text.toLowerCase().trim().substring(0, 50).replace(/\s+/g, ' ')
            : '';
        const key = review.reviewId || `${review.reviewerUrl || review.reviewerName.toLowerCase().trim()}|${review.rating}|${review.publishedDate || ''}|${review.text || ''}`;

        if (!seen.has(key)) {
            seen.set(key, review);
        }
        // If duplicate, keep the one already stored (first occurrence)
    }

    return Array.from(seen.values());
}

function getEmptyAnalysis(): ReviewAnalysisResult {
    return {
        overview: { healthScore: 0, totalReviews: 0, averageRating: 0, ratingMedian: 0, sentimentScore: 0, responseRate: 0, fakeReviewPercentage: 0, strengthsSummary: [], weaknessesSummary: ['No reviews to analyze'], riskAlerts: [], gradeLabel: 'N/A', netPromoterScore: 0, customerSatisfactionIndex: 0, reviewAuthenticityScore: 0, engagementScore: 0, reputationMomentum: 'STABLE' },
        sentiment: { overallScore: 0, overallLabel: 'N/A', positiveCount: 0, negativeCount: 0, neutralCount: 0, mixedCount: 0, averagePositiveIntensity: 0, averageNegativeIntensity: 0, sentimentTrend: [], mostPositiveReview: null, mostNegativeReview: null, emotionBreakdown: [], sentimentByRating: [], ratingTextAlignment: 0, sarcasmSuspectCount: 0, aspectSentiments: [] },
        ratings: { distribution: [], standardDeviation: 0, ratingTrend: [], ratingVelocity: 0, improvingOrDeclining: 'N/A', fiveStarRatio: 0, oneStarRatio: 0, polarizationIndex: 0, recentVsOverallDelta: 0, anomalyPeriods: [], weightedRating: 0, bayesianAverage: 0, ratingEntropy: 0 },
        responses: { totalResponses: 0, responseRate: 0, responseRateNegative: 0, responseRatePositive: 0, averageResponseLength: 0, templateDetectionRate: 0, empathyScore: 0, resolutionLanguageRate: 0, defensiveLanguageRate: 0, personalizedRate: 0, respondedByRating: [], unrespondedNegatives: [], averageResponseTime: 'N/A', responseQualityScore: 0 },
        legitimacy: { overallTrustScore: 0, totalSuspicious: 0, suspiciousPercentage: 0, noProfileReviewers: 0, oneReviewOnly: 0, oneReviewPercentage: 0, lowEffortReviews: 0, lowEffortPercentage: 0, ratingOnlyReviews: 0, ratingOnlyPercentage: 0, photolessReviewers: 0, photolessPercentage: 0, velocitySpikes: [], suspiciousPatterns: [], fakeScoreDistribution: [], topSuspiciousReviews: [], reviewerDiversityIndex: 0, duplicateContentCount: 0, averageReviewerExperience: 0 },
        content: { topKeywords: [], topPhrases: [], complaintThemes: [], praiseThemes: [], averageWordCount: 0, medianWordCount: 0, longReviewsCount: 0, shortReviewsCount: 0, languageQualityScore: 0, questionCount: 0, emojiUsageRate: 0, mentionedStaff: [], readabilityScore: 0, averageSentenceLength: 0, uniqueWordRatio: 0, trigrams: [], servicesMentioned: [], competitorMentions: [] },
        temporal: { reviewsPerMonth: [], averageReviewsPerMonth: 0, busiestMonth: 'N/A', slowestMonth: 'N/A', longestGap: null, recentTrend: 'N/A', dayOfWeekDistribution: [], recencyScore: 0, burstPeriods: [], seasonalPattern: null, firstReviewDate: 'N/A', lastReviewDate: 'N/A', reviewLifespan: 0, growthRate: 0 },
        actions: { priorityIssues: [], recommendedActions: [], suggestedResponses: [], overallRecommendation: 'No reviews available for analysis.', quickWins: [], longTermStrategies: [] },
        competitive: { industryBenchmark: [], strengthsVsCompetitors: [], weaknessesVsCompetitors: [], marketPositioning: 'Unknown' },
        reviewer: { averageReviewsPerReviewer: 0, averagePhotosPerReviewer: 0, topReviewers: [], returningReviewers: 0, reviewerLoyaltyIndicators: [] },
    };
}
