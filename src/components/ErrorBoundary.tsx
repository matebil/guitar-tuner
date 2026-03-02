/**
 * Matebil Guitar Tuner
 * Copyright (c) 2025 Matebil Limited
 * Licensed under MIT License
 * https://github.com/matebil/guitar-tuner
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { logger } from '../utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch and handle React errors gracefully
 * Prevents the entire app from crashing when a component error occurs
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to console (in production, you might send to error tracking service)
    logger.error('Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI when an error occurs
      return (
        <View style={styles.container}>
          <View style={styles.errorBox}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorTitle}>Oops! Something went wrong</Text>
            <Text style={styles.errorMessage}>
              The app encountered an unexpected error. Please restart the app.
            </Text>
            {__DEV__ && this.state.error && (
              <View style={styles.debugBox}>
                <Text style={styles.debugTitle}>Error Details (dev only):</Text>
                <Text style={styles.debugText}>{this.state.error.toString()}</Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 30,
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ff3333',
  },
  errorEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff3333',
    marginBottom: 15,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 24,
  },
  debugBox: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    width: '100%',
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff9933',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
  },
});
