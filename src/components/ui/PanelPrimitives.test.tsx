import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionButton, NumericField } from './PanelPrimitives';

describe('PanelPrimitives', () => {
    it('exposes pressed state for active action buttons', () => {
        render(
            <ActionButton
                label="Start"
                active
                color="#22c55e"
                onClick={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: /start/i })).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps invalid numeric drafts visible and announces the range', () => {
        const onChange = vi.fn();

        render(
            <NumericField
                label="Capacity"
                value={10}
                unit="MW"
                min={0}
                max={100}
                step={1}
                accentClass="text-blue-300"
                testId="capacity-input"
                onChange={onChange}
            />,
        );

        const input = screen.getByLabelText('Capacity');
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);

        expect(onChange).not.toHaveBeenCalled();
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent('Enter 0-100 MW.');

        fireEvent.change(input, { target: { value: '50' } });
        fireEvent.blur(input);

        expect(onChange).toHaveBeenCalledWith(50);
        expect(input).not.toHaveAttribute('aria-invalid');
    });
});
