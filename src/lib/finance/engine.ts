
interface FinancialMetrics {
    currentBalance: number;
    averageBurnRate: number; // Monthly expenses (avg of last 3 months)
    runwayMonths: number;
    projectedBalance: number[]; // Next 12 months
}

export function calculateMetrics(transactions: unknown[]): FinancialMetrics {
    // Mock logic for demo purposes (robust logic would group by month)
    // In a real app, we'd filter transactions by last 3 months expenses
    void transactions;

    const currentBalance = 43000; // Mock current balance
    const averageBurnRate = 11500; // Mock avg burn

    const runwayMonths = averageBurnRate > 0 ? currentBalance / averageBurnRate : 999;

    const projectedBalance = [];
    let balance = currentBalance;

    for (let i = 0; i < 12; i++) {
        // Simple linear projection
        balance -= averageBurnRate;
        // Add some random revenue variation for realism
        balance += 15000; // Mock reliable income
        projectedBalance.push(balance);
    }

    return {
        currentBalance,
        averageBurnRate,
        runwayMonths: Number(runwayMonths.toFixed(1)),
        projectedBalance
    };
}
