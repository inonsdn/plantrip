'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { createTripAction } from '@/lib/actions/trips';
import { COMMON_CURRENCIES } from '@/lib/currencies';

export function CreateTripForm({ defaultDisplayName }: { defaultDisplayName: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [baseCurrency, setBaseCurrency] = useState('THB');
  const [secondaryCurrency, setSecondaryCurrency] = useState('');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const input = {
      name: String(form.get('name') ?? ''),
      destination: String(form.get('destination') ?? ''),
      startDate: String(form.get('startDate') ?? ''),
      endDate: String(form.get('endDate') ?? ''),
      baseCurrency: String(form.get('baseCurrency') ?? 'THB'),
      secondaryCurrency: String(form.get('secondaryCurrency') ?? ''),
      secondaryRate: String(form.get('secondaryRate') ?? ''),
      ownerDisplayName: String(form.get('ownerDisplayName') ?? ''),
    };

    setErrors({});
    setFormError(null);

    startTransition(async () => {
      const result = await createTripAction(input);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      showToast({ message: 'สร้างทริปเรียบร้อย ส่งลิงก์ชวนเพื่อนได้เลย', tone: 'success' });
      router.replace(`/trips/${result.data.tripId}?share=1`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label="ชื่อทริป" htmlFor="name" error={errors.name} required>
        <TextInput
          id="name"
          name="name"
          placeholder="เช่น เที่ยวสิงคโปร์กับเพื่อน"
          autoFocus
          required
          maxLength={120}
        />
      </Field>

      <Field label="จุดหมาย" htmlFor="destination" error={errors.destination}>
        <TextInput id="destination" name="destination" placeholder="เช่น สิงคโปร์" maxLength={160} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="วันเริ่มต้น" htmlFor="startDate" error={errors.startDate}>
          <TextInput id="startDate" name="startDate" type="date" />
        </Field>
        <Field label="วันสิ้นสุด" htmlFor="endDate" error={errors.endDate}>
          <TextInput id="endDate" name="endDate" type="date" />
        </Field>
      </div>

      <Field
        label="สกุลเงินหลัก"
        htmlFor="baseCurrency"
        error={errors.baseCurrency}
        hint="ยอดสรุปทั้งหมดจะแสดงด้วยสกุลเงินนี้"
      >
        <Select
          id="baseCurrency"
          name="baseCurrency"
          value={baseCurrency}
          onChange={(event) => setBaseCurrency(event.target.value)}
        >
          {COMMON_CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="rounded-lg border border-line bg-canvas p-3">
        <p className="text-sm font-medium text-ink">สกุลเงินรอง (ถ้ามี)</p>
        <p className="mt-0.5 text-xs leading-5 text-muted">
          เพิ่มสกุลเงินของประเทศที่ไป เพื่อกรอกยอดตามบิลจริงได้ทันที เพิ่มสกุลอื่นทีหลังได้เสมอ
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="สกุลเงินรอง" htmlFor="secondaryCurrency" error={errors.secondaryCurrency}>
            <Select
              id="secondaryCurrency"
              name="secondaryCurrency"
              value={secondaryCurrency}
              onChange={(event) => setSecondaryCurrency(event.target.value)}
            >
              <option value="">ไม่ใช้สกุลเงินรอง</option>
              {COMMON_CURRENCIES.filter((currency) => currency.code !== baseCurrency).map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="อัตราแลกเปลี่ยนเริ่มต้น"
            htmlFor="secondaryRate"
            error={errors.secondaryRate}
            hint={
              secondaryCurrency
                ? `1 ${secondaryCurrency} = ? ${baseCurrency}`
                : 'เลือกสกุลเงินรองก่อน'
            }
          >
            <TextInput
              id="secondaryRate"
              name="secondaryRate"
              type="text"
              inputMode="decimal"
              placeholder="เช่น 26"
              disabled={!secondaryCurrency}
            />
          </Field>
        </div>
      </div>

      <Field
        label="ชื่อของคุณในทริปนี้"
        htmlFor="ownerDisplayName"
        error={errors.ownerDisplayName}
        hint="ชื่อที่เพื่อนร่วมทริปจะเห็นในรายการค่าใช้จ่าย"
        required
      >
        <TextInput
          id="ownerDisplayName"
          name="ownerDisplayName"
          defaultValue={defaultDisplayName}
          maxLength={60}
          required
        />
      </Field>

      {formError ? (
        <p role="alert" className="rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => router.push('/trips')} disabled={pending}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'กำลังสร้างทริป…' : 'สร้างทริป'}
        </Button>
      </div>
    </form>
  );
}
