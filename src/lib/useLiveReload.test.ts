import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './useLiveReload';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('รอบใหม่ 1 รอบ (study + หลาย step) โหลดใหม่ครั้งเดียว', () => {
    const fn = vi.fn();
    const call = debounce(fn, 1500);
    call(); // study
    vi.advanceTimersByTime(100);
    call(); // step 1
    call(); // step 2
    vi.advanceTimersByTime(1499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel ตอนออกจากหน้า แล้วไม่โหลดอีก', () => {
    const fn = vi.fn();
    const call = debounce(fn, 1500);
    call();
    call.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});
