import { useState } from 'react';
import { usePreferences } from '../contexts/usePreferences';

export default function FloatingCalculator() {
  const prefs = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);

  if (!prefs.showCalculator) return null;

  const handleNumber = (num: string) => {
    if (waitingForNewValue) {
      setDisplay(num);
      setWaitingForNewValue(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const handleDecimal = () => {
    if (waitingForNewValue) {
      setDisplay('0.');
      setWaitingForNewValue(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleOperation = (op: string) => {
    const currentValue = parseFloat(display);

    if (prevValue === null) {
      setPrevValue(currentValue);
    } else if (operation) {
      const result = calculate(prevValue, currentValue, operation);
      setDisplay(result.toString());
      setPrevValue(result);
    }

    setOperation(op);
    setWaitingForNewValue(true);
  };

  const calculate = (prev: number, current: number, op: string): number => {
    switch (op) {
      case '+': return prev + current;
      case '−': return prev - current;
      case '×': return prev * current;
      case '÷': return prev / current;
      default: return current;
    }
  };

  const handleEquals = () => {
    if (operation && prevValue !== null) {
      const currentValue = parseFloat(display);
      const result = calculate(prevValue, currentValue, operation);
      setDisplay(result.toString());
      setPrevValue(null);
      setOperation(null);
      setWaitingForNewValue(true);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperation(null);
    setWaitingForNewValue(false);
  };

  const handleBackspace = () => {
    if (display.length === 1) {
      setDisplay('0');
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const handlePercent = () => {
    const value = parseFloat(display);
    setDisplay((value / 100).toString());
  };

  const handleToggleSign = () => {
    const value = parseFloat(display);
    setDisplay((value * -1).toString());
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl z-40"
        style={{
          background: '#1e40af',
          color: 'white',
        }}
        title="Open Calculator"
      >
        🧮
      </button>
    );
  }

  return (
    <div
      className="fixed top-20 right-6 w-72 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-card-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-card-border)' }}
      >
        <h3 className="text-sm font-semibold theme-text">Calculator</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-lg leading-none theme-text-muted hover:theme-text transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Display */}
      <div
        className="px-4 py-4 text-right"
        style={{ background: 'rgba(30,64,175,0.05)' }}
      >
        <div className="text-2xl font-mono font-bold theme-text break-words">
          {display}
        </div>
      </div>

      {/* Buttons */}
      <div className="p-3 space-y-2">
        {/* Row 1: Clear, Backspace, %, ÷ */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={handleClear}
            className="py-2 rounded-lg font-semibold text-sm transition-colors"
            style={{
              background: 'rgba(239,68,68,0.15)',
              color: '#dc2626',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            C
          </button>
          <button
            onClick={handleBackspace}
            className="py-2 rounded-lg font-semibold text-sm transition-colors"
            style={{
              background: 'rgba(30,64,175,0.1)',
              border: '1px solid rgba(30,64,175,0.3)',
            }}
            title="Backspace"
          >
            ←
          </button>
          <button
            onClick={handlePercent}
            className="py-2 rounded-lg font-semibold text-sm transition-colors theme-text-muted hover:theme-text"
            style={{ border: '1px solid var(--color-card-border)' }}
          >
            %
          </button>
          <button
            onClick={() => handleOperation('÷')}
            className="py-2 rounded-lg font-semibold text-sm transition-colors"
            style={{
              background: 'rgba(30,64,175,0.15)',
              color: '#1e40af',
              border: '1px solid rgba(30,64,175,0.3)',
            }}
          >
            ÷
          </button>
        </div>

        {/* Row 2: 7, 8, 9, × */}
        <div className="grid grid-cols-4 gap-2">
          {['7', '8', '9'].map(num => (
            <button
              key={num}
              onClick={() => handleNumber(num)}
              className="py-2 rounded-lg font-semibold text-sm transition-colors theme-text hover:theme-text-muted"
              style={{
                background: 'var(--color-row-hover)',
                border: '1px solid var(--color-card-border)',
              }}
            >
              {num}
            </button>
          ))}
          <button
            onClick={() => handleOperation('×')}
            className="py-2 rounded-lg font-semibold text-sm transition-colors"
            style={{
              background: 'rgba(30,64,175,0.15)',
              color: '#1e40af',
              border: '1px solid rgba(30,64,175,0.3)',
            }}
          >
            ×
          </button>
        </div>

        {/* Row 3: 4, 5, 6, − */}
        <div className="grid grid-cols-4 gap-2">
          {['4', '5', '6'].map(num => (
            <button
              key={num}
              onClick={() => handleNumber(num)}
              className="py-2 rounded-lg font-semibold text-sm transition-colors theme-text hover:theme-text-muted"
              style={{
                background: 'var(--color-row-hover)',
                border: '1px solid var(--color-card-border)',
              }}
            >
              {num}
            </button>
          ))}
          <button
            onClick={() => handleOperation('−')}
            className="py-2 rounded-lg font-semibold text-sm transition-colors"
            style={{
              background: 'rgba(30,64,175,0.15)',
              color: '#1e40af',
              border: '1px solid rgba(30,64,175,0.3)',
            }}
          >
            −
          </button>
        </div>

        {/* Row 4: 1, 2, 3, + */}
        <div className="grid grid-cols-4 gap-2">
          {['1', '2', '3'].map(num => (
            <button
              key={num}
              onClick={() => handleNumber(num)}
              className="py-2 rounded-lg font-semibold text-sm transition-colors theme-text hover:theme-text-muted"
              style={{
                background: 'var(--color-row-hover)',
                border: '1px solid var(--color-card-border)',
              }}
            >
              {num}
            </button>
          ))}
          <button
            onClick={() => handleOperation('+')}
            className="py-2 rounded-lg font-semibold text-sm transition-colors"
            style={{
              background: 'rgba(30,64,175,0.15)',
              color: '#1e40af',
              border: '1px solid rgba(30,64,175,0.3)',
            }}
          >
            +
          </button>
        </div>

        {/* Row 5: 0, ., +/−, = */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => handleNumber('0')}
            className="col-span-2 py-2 rounded-lg font-semibold text-sm transition-colors theme-text hover:theme-text-muted"
            style={{
              background: 'var(--color-row-hover)',
              border: '1px solid var(--color-card-border)',
            }}
          >
            0
          </button>
          <button
            onClick={handleDecimal}
            className="py-2 rounded-lg font-semibold text-sm transition-colors theme-text-muted hover:theme-text"
            style={{ border: '1px solid var(--color-card-border)' }}
          >
            .
          </button>
          <button
            onClick={handleEquals}
            className="py-2 rounded-lg font-semibold text-sm transition-colors"
            style={{
              background: '#047857',
              color: 'white',
              border: '1px solid rgba(4,120,87,0.3)',
            }}
          >
            =
          </button>
        </div>

        {/* Sign toggle */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={handleToggleSign}
            className="col-span-4 py-2 rounded-lg font-semibold text-sm transition-colors theme-text-muted hover:theme-text"
            style={{
              background: 'var(--color-row-hover)',
              border: '1px solid var(--color-card-border)',
            }}
          >
            +/−
          </button>
        </div>
      </div>
    </div>
  );
}
