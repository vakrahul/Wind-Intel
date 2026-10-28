import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  formatMw,
  formatSignedMw,
  formatMwh,
  formatPct,
  buildTargetUtc,
} from '../utils/formatters';
import { LoadingState, ErrorState, EmptyState } from '../components/StateBanners';
import { EnergyIntelligenceTree } from '../components/EnergyIntelligenceTree';
import { DataLineagePipeline } from '../components/DataLineagePipeline';

describe('WINDLINE Frontend Formatters & State Components', () => {
  it('formats MW, signed MW, MWh, and target UTC strings accurately', () => {
    expect(formatMw(15420.4, 1)).toBe('15,420.4 MW');
    expect(formatSignedMw(820.5, 1)).toBe('+820.5 MW');
    expect(formatSignedMw(-410.2, 1)).toBe('-410.2 MW');
    expect(formatMwh(12000, 0)).toBe('12,000 MWh');
    expect(formatPct(99.86, 1)).toBe('99.9%');
    expect(buildTargetUtc('2026-01-15', 7)).toBe('2026-01-15T07:00:00Z');
  });

  it('renders LoadingState, ErrorState, and EmptyState banners with accessible roles', () => {
    render(<LoadingState message="Loading January 2026 telemetry..." />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading January 2026 telemetry...'
    );

    render(<ErrorState error="Elexon gateway timeout" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Elexon gateway timeout');

    render(<EmptyState title="No eligible pairs" />);
    expect(screen.getByText('No eligible pairs')).toBeInTheDocument();
  });

  it('renders EnergyIntelligenceTree with real interval figures and supports node selection', () => {
    const sampleTreeData = {
      interval_vintages: {
        target_start_utc: '2026-01-15T17:00:00Z',
        target_start_london: '2026-01-15 17:00 GMT',
        cutoff_utc: '2026-01-14T11:00:00Z',
        cutoff_london: '2026-01-14 11:00 GMT',
        actual_hourly_mw: 14200,
        actual_hh_00_mw: 14100,
        actual_hh_30_mw: 14300,
        error_mw: 800,
        abs_error_mw: 800,
        error_direction: 'overforecast',
        eligible_vintages_count: 4,
        excluded_future_vintages_count: 6,
        selected_vintage: {
          publish_time_utc: '2026-01-14T09:30:00Z',
          publish_time_london: '2026-01-14 09:30 GMT',
          forecast_mw: 15000,
          lead_time_hours: 31.5,
        },
      },
      day_metrics: {
        date: '2026-01-15',
        mae_mw: 750.2,
        rmse_mw: 910.4,
        mean_bias_mw: 320.1,
        coverage_pct: 100.0,
      },
      month_metrics: {
        mae_mw: 1120.5,
        rmse_mw: 1450.8,
        mean_bias_mw: 195.0,
        coverage_pct: 100.0,
        valid_paired_count: 744,
        total_target_hours: 744,
        overforecast_pct: 58.2,
        underforecast_pct: 41.8,
      },
      decision_interpretation: {
        headline: 'Overforecast of +800.0 MW at D-1 cutoff.',
      },
    };

    render(<EnergyIntelligenceTree treeData={sampleTreeData} />);
    expect(screen.getByRole('tree')).toBeInTheDocument();
    expect(screen.getAllByText(/15,000.0 MW/i).length).toBeGreaterThan(0);

    // Click Level 2 Forecast node and verify inspector panel updates
    const forecastNode = screen.getByRole('treeitem', {
      name: /Selected Elexon Wind Forecast/i,
    });
    fireEvent.click(forecastNode);
    expect(
      screen.getByText(/Elexon BMRS WINDFOR Dataset Stream/i)
    ).toBeInTheDocument();
  });

  it('renders 7-stage DataLineagePipeline and displays rejected post-cutoff vintage count', () => {
    const stages = [
      {
        stage_number: 1,
        stage_id: 'raw',
        title: 'Raw Elexon BMRS Records',
        subtitle: 'FUELHH & WINDFOR',
        primary_metric: '10 Vintages',
        detail: 'Retrieved raw records',
      },
      {
        stage_number: 4,
        stage_id: 'cutoff',
        title: 'Cutoff Gate & Vintage Selection',
        subtitle: 'publishTime <= cutoff',
        primary_metric: '15,000 MW',
        detail: 'Selected latest eligible vintage',
      },
    ];
    render(
      <DataLineagePipeline
        lineageStages={stages}
        intervalVintages={{
          eligible_vintages_count: 4,
          excluded_future_vintages_count: 6,
        }}
      />
    );
    expect(screen.getByText(/BLOCKED AFTER DEADLINE: 6/i)).toBeInTheDocument();
  });
});
