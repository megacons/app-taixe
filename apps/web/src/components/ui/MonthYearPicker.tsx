/**
 * MonthYearPicker — Web component dùng chung
 * 2 bước: chọn năm → chọn tháng (giống mobile)
 * Prop month: number 1-12, year: number
 */
import { useState, useRef, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface Props {
  month: number;          // 1-12
  year:  number;
  onChange: (month: number, year: number) => void;
  className?: string;
}

const MONTHS_SHORT = ['Th1','Th2','Th3','Th4','Th5','Th6',
                      'Th7','Th8','Th9','Th10','Th11','Th12'];

const START_YEAR = new Date().getFullYear() - 5;
const END_YEAR   = new Date().getFullYear() + 20;
const YEARS      = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

type Step = 'year' | 'month';

export default function MonthYearPicker({ month, year, onChange, className = '' }: Props) {
  const [open,    setOpen]    = useState(false);
  const [step,    setStep]    = useState<Step>('year');
  const [selYear, setSelYear] = useState(year);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const openPicker = () => {
    setSelYear(year);
    setStep('year');
    setOpen(true);
  };

  const prev = () => {
    if (month === 1) onChange(12, year - 1);
    else onChange(month - 1, year);
  };
  const next = () => {
    if (month === 12) onChange(1, year + 1);
    else onChange(month + 1, year);
  };

  const handleSelectYear = (y: number) => { setSelYear(y); setStep('month'); };
  const handleSelectMonth = (m: number) => { onChange(m, selYear); setOpen(false); };

  return (
    <div ref={ref} className={`relative flex items-center gap-1 ${className}`}>
      {/* Prev arrow */}
      <button
        onClick={prev}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        title="Tháng trước"
      >
        <ChevronLeftIcon className="w-4 h-4 text-primary" />
      </button>

      {/* Label button */}
      <button
        onClick={openPicker}
        className="text-sm font-bold text-primary px-3 py-1.5 rounded-lg border-2 border-primary/25 bg-white hover:bg-primary/5 transition-colors min-w-[110px] text-center"
      >
        Tháng {month}/{year}
      </button>

      {/* Next arrow */}
      <button
        onClick={next}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        title="Tháng sau"
      >
        <ChevronRightIcon className="w-4 h-4 text-primary" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 w-64 overflow-hidden">

          {step === 'year' ? (
            <>
              <div className="px-4 py-3 bg-primary text-white text-sm font-semibold">
                Chọn năm
              </div>
              <div className="max-h-60 overflow-y-auto">
                {YEARS.map(y => (
                  <button
                    key={y}
                    onClick={() => handleSelectYear(y)}
                    className={`w-full text-left px-5 py-2.5 text-sm border-b border-gray-50 transition-colors flex justify-between items-center
                      ${y === year
                        ? 'bg-primary/10 text-primary font-bold'
                        : 'hover:bg-gray-50 text-gray-700'
                      }`}
                  >
                    <span>{y}</span>
                    {y === year && <ChevronRightIcon className="w-3.5 h-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="px-4 py-3 bg-primary text-white text-sm font-semibold flex items-center gap-3">
                <button
                  onClick={() => setStep('year')}
                  className="hover:opacity-75 transition-opacity"
                >
                  ←
                </button>
                <span>{selYear}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 p-3">
                {MONTHS_SHORT.map((m, i) => {
                  const mn = i + 1;
                  const active = selYear === year && mn === month;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelectMonth(mn)}
                      className={`py-2 rounded-lg text-xs font-semibold transition-colors
                        ${active
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 hover:bg-primary/10 text-gray-700'
                        }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-gray-100 px-3 py-2">
                <button
                  onClick={() => {
                    const n = new Date();
                    onChange(n.getMonth() + 1, n.getFullYear());
                    setOpen(false);
                  }}
                  className="text-xs text-primary font-semibold hover:underline w-full text-center"
                >
                  Tháng hiện tại
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
