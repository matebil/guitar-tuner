/**
 * Find the closest string/fret position in a tuning to a detected frequency
 * @param {number} frequency - Detected frequency in Hz
 * @param {object} tuning - Tuning preset object
 * @returns {object} - Matched string info or null
 */
export function findClosestString(frequency, tuning) {
  if (!frequency || !tuning?.allPositions) return null;

  let bestMatch = null;
  let minDistance = Infinity;

  // Search through all fret positions (0-14 on all strings)
  tuning.allPositions.forEach((position) => {
    // Calculate frequency range for this position (±100 cents = 1 semitone)
    const semitoneRatio = Math.pow(2, 1/12);
    const centsRange = 1.0; // ±100 cents = 1 full semitone
    const lowerBound = position.frequency / Math.pow(semitoneRatio, centsRange);
    const upperBound = position.frequency * Math.pow(semitoneRatio, centsRange);
    
    // Check if frequency falls within this position's range
    if (frequency >= lowerBound && frequency <= upperBound) {
      const distance = Math.abs(frequency - position.frequency);
      
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = {
          ...position,
          targetFrequency: position.frequency,
        };
      }
    }
  });

  return bestMatch;
}

/**
 * Calculate cents deviation from target frequency
 * @param {number} detected - Detected frequency in Hz
 * @param {number} target - Target frequency in Hz
 * @returns {number} - Cents off (positive = sharp, negative = flat)
 */
export function calculateCents(detected, target) {
  if (!detected || !target) return 0;
  
  // Cents = 1200 × log₂(f₁/f₂)
  return 1200 * Math.log2(detected / target);
}

/**
 * Convert Int16 PCM samples to Float32 (required by pitchfinder)
 * @param {Int16Array} samples - Raw PCM data
 * @returns {Float32Array} - Normalized float samples (-1 to 1)
 */
export function int16ToFloat32(samples) {
  const floatSamples = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    floatSamples[i] = samples[i] / 32768.0;
  }
  return floatSamples;
}

/**
 * Get status color based on cents deviation
 * @param {number} centsOff - Cents deviation
 * @returns {string} - Color hex code
 */
export function getStatusColor(centsOff) {
  const abs = Math.abs(centsOff);
  if (abs < 5) return '#00ff00';   // Green - in tune
  if (abs < 15) return '#ffff00';  // Yellow - close
  return '#ff0000';                // Red - way off
}

/**
 * Get status text based on cents deviation
 * @param {number} centsOff - Cents deviation
 * @returns {string} - Status message
 */
export function getStatusText(centsOff) {
  const abs = Math.abs(centsOff);
  
  if (abs < 3) return 'IN TUNE ✓';
  if (centsOff < 0) return `${abs.toFixed(0)} cents FLAT`;
  return `${centsOff.toFixed(0)} cents SHARP`;
}
