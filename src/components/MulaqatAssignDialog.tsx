import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useDelegations } from '@/hooks/useDelegations';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DelegationCombobox } from '@/components/DelegationCombobox';
import type { Guest } from '@/types';

type MulaqatTypeVal = 'No' | 'Delegation' | 'Daftari' | 'Both';

interface DaftariDay { id: string; date: string; label: string | null; }
interface DaftariSlotInfo { id: string; name: string; day_id: string | null; }

interface Props {
  guest: Guest;
  stopPropagation?: boolean;
}

export function MulaqatAssignDialog({ guest, stopPropagation = false }: Props) {
  const { user } = useAuth();
  const { updateGuest } = useGuests();
  const { getDelegationCountry } = useDelegations();

  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<MulaqatTypeVal>('No');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedRole, setSelectedRole] = useState<'Member' | 'Head of Delegation'>('Member');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedDayId, setSelectedDayId] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [daftariDays, setDaftariDays] = useState<DaftariDay[]>([]);
  const [daftariSlots, setDaftariSlots] = useState<DaftariSlotInfo[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleOpen = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    // Pre-populate from current guest state
    setSelectedType(guest.mulaqatType ?? 'No');
    setSelectedCountry(getDelegationCountry(guest.delegationId) ?? guest.country);
    setSelectedRole('Member');
    setSelectedLanguage('');
    setSelectedDayId('');
    setSelectedSlotId('');
    setOpen(true);
  };

  // Fetch reference data and current values when dialog opens
  useEffect(() => {
    if (!open) return;

    // Fetch daftari days and languages
    Promise.all([
      supabase.from('daftari_days').select('id, date, label').eq('is_active', true).order('date'),
      supabase.from('mulaqat_languages').select('name').eq('is_active', true).order('name'),
    ]).then(([{ data: days }, { data: langs }]) => {
      if (days) setDaftariDays(days as DaftariDay[]);
      if (langs) setLanguages((langs as { name: string }[]).map(l => l.name));
    });

    // Fetch current delegation role
    if (guest.delegationId) {
      supabase.from('delegation_members').select('is_head').eq('guest_id', guest.id).maybeSingle()
        .then(({ data }) => { if (data?.is_head) setSelectedRole('Head of Delegation'); });
    }

    // Fetch current daftari slot
    if (guest.mulaqatType === 'Daftari' || guest.mulaqatType === 'Both') {
      supabase.from('daftari_slots').select('id, name, day_id').eq('guest_id', guest.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setSelectedSlotId(data.id);
            setSelectedDayId(data.day_id ?? '');
          }
        });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch slots when day selected
  useEffect(() => {
    if (!selectedDayId) { setDaftariSlots([]); return; }
    supabase.from('daftari_slots').select('id, name, day_id').eq('day_id', selectedDayId).order('name')
      .then(({ data }) => { if (data) setDaftariSlots(data as DaftariSlotInfo[]); });
  }, [selectedDayId]);

  // Core removal logic (shared by both Remove button and Save with type=No)
  const doRemove = async () => {
    await supabase.from('delegation_members').delete().eq('guest_id', guest.id);
    await supabase.from('daftari_slots').update({ guest_id: null, guest_name: null, language: null }).eq('guest_id', guest.id);
    updateGuest(guest.id, { mulaqat: false, mulaqatType: 'No', delegationId: null });
    toast.success(`Mulaqat removed for ${guest.fullName}`);
  };

  const handleRemove = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await doRemove();
      setOpen(false);
    } catch {
      toast.error('Failed to remove mulaqat');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (selectedType === 'No') {
        await doRemove();
        setOpen(false);
        return;
      }

      // ── Delegation / Both ───────────────────────────────────────────────────
      if (selectedType === 'Delegation' || selectedType === 'Both') {
        const country = selectedCountry || guest.country;

        // Find or create delegation for selected country
        let delegation: { id: string; country: string } | null = null;
        const { data: existingDel } = await supabase
          .from('delegations').select('id, country').eq('country', country).maybeSingle();
        delegation = existingDel as typeof delegation;

        if (!delegation) {
          const { data: newDel } = await supabase
            .from('delegations')
            .insert({ country, managed_by: user.id, managed_by_name: user.name })
            .select('id, country').single();
          delegation = newDel as typeof delegation;
        }

        if (delegation) {
          // Switch delegation if needed
          if (guest.delegationId && guest.delegationId !== delegation.id) {
            await supabase.from('delegation_members').delete().eq('guest_id', guest.id);
          }

          // Upsert membership
          const { data: existingMember } = await supabase
            .from('delegation_members').select('id').eq('guest_id', guest.id).maybeSingle();
          if (existingMember) {
            await supabase.from('delegation_members').update({
              delegation_id: delegation.id,
              is_head: selectedRole === 'Head of Delegation',
            }).eq('guest_id', guest.id);
          } else {
            await supabase.from('delegation_members').insert({
              delegation_id: delegation.id,
              guest_id: guest.id,
              guest_name: guest.fullName,
              is_head: selectedRole === 'Head of Delegation',
            });
          }

          updateGuest(guest.id, { mulaqat: true, mulaqatType: selectedType, delegationId: delegation.id });
        }
      }

      // ── Daftari / Both ──────────────────────────────────────────────────────
      if (selectedType === 'Daftari' || selectedType === 'Both') {
        // Clear existing daftari slot
        await supabase.from('daftari_slots')
          .update({ guest_id: null, guest_name: null, language: null })
          .eq('guest_id', guest.id);

        // Assign to new slot
        if (selectedSlotId) {
          await supabase.from('daftari_slots').update({
            guest_id: guest.id,
            guest_name: guest.fullName,
            language: selectedLanguage || null,
          }).eq('id', selectedSlotId);
        }

        if (selectedType === 'Daftari') {
          await supabase.from('delegation_members').delete().eq('guest_id', guest.id);
          updateGuest(guest.id, { mulaqat: true, mulaqatType: 'Daftari', delegationId: null });
        }
      }

      toast.success(`${guest.fullName} assigned to ${selectedType} Mulaqat`);
      setOpen(false);
    } catch {
      toast.error('Failed to save mulaqat assignment');
    } finally {
      setSaving(false);
    }
  };

  const currentType = guest.mulaqatType ?? 'No';
  const hasAssignment = !!guest.mulaqat && currentType !== 'No';

  const dayLabel = (d: DaftariDay) => {
    const dt = new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return d.label ? `${dt} — ${d.label}` : dt;
  };

  return (
    <>
      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      {hasAssignment ? (
        <button
          onClick={handleOpen}
          className={`text-xs px-2 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
            currentType === 'Delegation' ? 'bg-green-50 text-green-700 hover:bg-green-100' :
            currentType === 'Daftari'    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' :
                                           'bg-purple-50 text-purple-700 hover:bg-purple-100'
          }`}
        >
          ✅ {currentType}
        </button>
      ) : (
        <button
          onClick={handleOpen}
          className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-lg px-2 py-1 cursor-pointer hover:border-[#2D5A45] hover:text-[#2D5A45] transition-colors flex items-center gap-1 whitespace-nowrap"
        >
          + Assign <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {/* ── Dialog ──────────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={o => { if (!o) setOpen(false); }}>
        <DialogContent className="max-w-sm" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-base">Assign Mulaqat</DialogTitle>
            <p className="text-sm text-[#4A4A4A] mt-0.5">{guest.fullName}</p>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Type toggles */}
            <div>
              <p className="text-xs font-semibold text-[#4A4A4A] mb-2">Type</p>
              <div className="flex gap-2">
                {(['Delegation', 'Daftari', 'Both'] as MulaqatTypeVal[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedType === t
                        ? 'bg-[#2D5A45] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Delegation fields */}
            {(selectedType === 'Delegation' || selectedType === 'Both') && (
              <>
                <div>
                  <p className="text-xs font-semibold text-[#4A4A4A] mb-1.5">Delegation</p>
                  <DelegationCombobox
                    value={selectedCountry}
                    onChange={setSelectedCountry}
                    placeholder="Select country or group..."
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#4A4A4A] mb-1.5">Role in Delegation</p>
                  <div className="flex gap-2">
                    {(['Member', 'Head of Delegation'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setSelectedRole(r)}
                        className={`flex-1 py-1.5 rounded-lg text-sm transition-colors ${
                          selectedRole === r
                            ? 'bg-[#2D5A45] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Daftari fields */}
            {(selectedType === 'Daftari' || selectedType === 'Both') && (
              <>
                <div>
                  <p className="text-xs font-semibold text-[#4A4A4A] mb-1.5">Day</p>
                  {daftariDays.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No active daftari days found</p>
                  ) : (
                    <select
                      value={selectedDayId}
                      onChange={e => { setSelectedDayId(e.target.value); setSelectedSlotId(''); }}
                      className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                    >
                      <option value="">Select Day...</option>
                      {daftariDays.map(d => (
                        <option key={d.id} value={d.id}>{dayLabel(d)}</option>
                      ))}
                    </select>
                  )}
                </div>
                {selectedDayId && (
                  <div>
                    <p className="text-xs font-semibold text-[#4A4A4A] mb-1.5">Slot</p>
                    {daftariSlots.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No slots for this day</p>
                    ) : (
                      <select
                        value={selectedSlotId}
                        onChange={e => setSelectedSlotId(e.target.value)}
                        className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                      >
                        <option value="">Select Slot...</option>
                        {daftariSlots.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Language (when data available) */}
            {languages.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#4A4A4A] mb-1.5">Language</p>
                <select
                  value={selectedLanguage}
                  onChange={e => setSelectedLanguage(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D4CFC7] rounded-md text-sm bg-white focus:border-[#2D5A45] focus:outline-none"
                >
                  <option value="">Select Language...</option>
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center gap-2">
            {hasAssignment && (
              <button
                onClick={handleRemove}
                disabled={saving}
                className="text-red-500 text-xs hover:text-red-700 mr-auto disabled:opacity-50 transition-colors"
              >
                Remove Mulaqat
              </button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              {saving ? 'Saving...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
