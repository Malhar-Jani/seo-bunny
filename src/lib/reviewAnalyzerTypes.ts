/**
 * reviewAnalyzerTypes.ts — All type definitions for the deep analysis engine.
 */

export interface ReviewAnalysisResult {
    overview: OverviewMetrics;
    sentiment: SentimentMetrics;
    ratings: RatingMetrics;
    responses: ResponseMetrics;
    legitimacy: LegitimacyMetrics;
    content: ContentMetrics;
    temporal: TemporalMetrics;
    actions: ActionMetrics;
    competitive: CompetitiveMetrics;
    reviewer: ReviewerMetrics;
}

export interface OverviewMetrics {
    healthScore: number;
    totalReviews: number;
    averageRating: number;
    ratingMedian: number;
    sentimentScore: number;
    responseRate: number;
    fakeReviewPercentage: number;
    strengthsSummary: string[];
    weaknessesSummary: string[];
    riskAlerts: string[];
    gradeLabel: string;
    netPromoterScore: number;          // -100 to 100
    customerSatisfactionIndex: number; // 0-100
    reviewAuthenticityScore: number;   // 0-100
    engagementScore: number;           // 0-100
    reputationMomentum: string;        // RISING, FALLING, STABLE
}

export interface SentimentMetrics {
    overallScore: number;
    overallLabel: string;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    mixedCount: number;
    averagePositiveIntensity: number;
    averageNegativeIntensity: number;
    sentimentTrend: { period: string; score: number }[];
    mostPositiveReview: { text: string; score: number; reviewer: string } | null;
    mostNegativeReview: { text: string; score: number; reviewer: string } | null;
    emotionBreakdown: { emotion: string; count: number; percentage: number }[];
    sentimentByRating: { rating: number; avgSentiment: number }[];
    ratingTextAlignment: number;       // 0-100 how well ratings match text sentiment
    sarcasmSuspectCount: number;
    aspectSentiments: { aspect: string; positive: number; negative: number; neutral: number }[];
}

export interface RatingMetrics {
    distribution: { rating: number; count: number; percentage: number }[];
    standardDeviation: number;
    ratingTrend: { period: string; avgRating: number; count: number }[];
    ratingVelocity: number;
    improvingOrDeclining: string;
    fiveStarRatio: number;
    oneStarRatio: number;
    polarizationIndex: number;
    recentVsOverallDelta: number;
    anomalyPeriods: { period: string; reason: string }[];
    weightedRating: number;            // recency-weighted
    bayesianAverage: number;           // Bayesian average (IMDB formula)
    ratingEntropy: number;             // information entropy of distribution
}

export interface ResponseMetrics {
    totalResponses: number;
    responseRate: number;
    responseRateNegative: number;
    responseRatePositive: number;
    averageResponseLength: number;
    templateDetectionRate: number;
    empathyScore: number;
    resolutionLanguageRate: number;
    defensiveLanguageRate: number;
    personalizedRate: number;
    respondedByRating: { rating: number; responseRate: number }[];
    unrespondedNegatives: { reviewer: string; text: string; rating: number; date: string }[];
    averageResponseTime: string;       // estimated
    responseQualityScore: number;      // 0-100 overall quality
}

export interface LegitimacyMetrics {
    overallTrustScore: number;
    totalSuspicious: number;
    suspiciousPercentage: number;
    noProfileReviewers: number;
    oneReviewOnly: number;
    oneReviewPercentage: number;
    lowEffortReviews: number;
    lowEffortPercentage: number;
    ratingOnlyReviews: number;
    ratingOnlyPercentage: number;
    photolessReviewers: number;
    photolessPercentage: number;
    velocitySpikes: { period: string; count: number; normal: number }[];
    suspiciousPatterns: string[];
    fakeScoreDistribution: { range: string; count: number }[];
    topSuspiciousReviews: { reviewer: string; rating: number; text: string; score: number; reasons: string[] }[];
    reviewerDiversityIndex: number;    // 0-1 Shannon diversity
    duplicateContentCount: number;
    averageReviewerExperience: number; // avg review count of reviewers
}

export interface ContentMetrics {
    topKeywords: { word: string; count: number; sentiment: string }[];
    topPhrases: { phrase: string; count: number }[];
    complaintThemes: { theme: string; count: number; examples: string[] }[];
    praiseThemes: { theme: string; count: number; examples: string[] }[];
    averageWordCount: number;
    medianWordCount: number;
    longReviewsCount: number;
    shortReviewsCount: number;
    languageQualityScore: number;
    questionCount: number;
    emojiUsageRate: number;
    mentionedStaff: string[];
    readabilityScore: number;          // Flesch-Kincaid
    averageSentenceLength: number;
    uniqueWordRatio: number;           // vocabulary diversity
    trigrams: { phrase: string; count: number }[];
    servicesMentioned: { service: string; count: number; sentiment: string }[];
    competitorMentions: string[];
}

export interface TemporalMetrics {
    reviewsPerMonth: { month: string; count: number }[];
    averageReviewsPerMonth: number;
    busiestMonth: string;
    slowestMonth: string;
    longestGap: { start: string; end: string; days: number } | null;
    recentTrend: string;
    dayOfWeekDistribution: { day: string; count: number }[];
    recencyScore: number;
    burstPeriods: { period: string; count: number; avgMonthly: number }[];
    seasonalPattern: string | null;
    firstReviewDate: string;
    lastReviewDate: string;
    reviewLifespan: number;            // months
    growthRate: number;                // % change recent vs older
}

export interface ActionMetrics {
    priorityIssues: { issue: string; severity: string; evidence: string; suggestion: string }[];
    recommendedActions: { action: string; priority: string; impact: string }[];
    suggestedResponses: { reviewerName: string; reviewText: string; rating: number; sentiment: string; suggestedResponse: string }[];
    overallRecommendation: string;
    quickWins: string[];
    longTermStrategies: string[];
}

export interface CompetitiveMetrics {
    industryBenchmark: { metric: string; yours: number; benchmark: number; verdict: string }[];
    strengthsVsCompetitors: string[];
    weaknessesVsCompetitors: string[];
    marketPositioning: string;
}

export interface ReviewerMetrics {
    averageReviewsPerReviewer: number;
    averagePhotosPerReviewer: number;
    topReviewers: { name: string; reviewCount: number; avgRating: number }[];
    returningReviewers: number;        // reviewers who updated reviews
    reviewerLoyaltyIndicators: string[];
}
