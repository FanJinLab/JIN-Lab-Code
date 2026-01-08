
// In a real production app, we would use a library like ml-levenberg-marquardt.
// For this demo, we'll provide a simplified mock solver and R2 calculator.

export const calculateR2 = (yActual: number[], yPredicted: number[]): number => {
  const n = yActual.length;
  if (n === 0) return 0;
  
  const yMean = yActual.reduce((a, b) => a + b, 0) / n;
  const ssRes = yActual.reduce((acc, y, i) => acc + Math.pow(y - yPredicted[i], 2), 0);
  const ssTot = yActual.reduce((acc, y) => acc + Math.pow(y - yMean, 2), 0);
  
  return 1 - (ssRes / (ssTot || 1));
};

// Update mockFit to return rmse to satisfy FitResult interface requirements.
export const mockFit = async (t: number[], y: number[], equation: string): Promise<{params: any, r2: number, rmse: number}> => {
  // Simulating a fitting delay
  await new Promise(r => setTimeout(r, 100));
  
  // Return random-ish but realistic looking parameters
  const r2 = 0.85 + Math.random() * 0.14;
  const rmse = 0.01 + Math.random() * 0.05;
  return {
    params: { a: 1.2, k: 0.05, c: 0.5 },
    r2,
    rmse
  };
};
