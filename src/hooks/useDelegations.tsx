import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { toast } from 'sonner';
import type { Guest } from '@/types';

interface Delegation {
  id: string;
  country: string;
}

export function useDelegations() {
  const { user } = useAuth();
  const { updateGuest } = useGuests();
  const [delegations, setDelegations] = useState<Delegation[]>([]);

  useEffect(() => {
    supabase
      .from('delegations')
      .select('id, country')
      .then(({ data }) => { if (data) setDelegations(data); });
  }, []);

  /** Return the country name for a delegation by its ID. */
  const getDelegationCountry = useCallback(
    (delegationId: string | null | undefined): string | null => {
      if (!delegationId) return null;
      return delegations.find(d => d.id === delegationId)?.country ?? null;
    },
    [delegations],
  );

  /** Find or create a delegation for `country`. Returns the delegation row. */
  const findOrCreate = useCallback(async (country: string): Promise<Delegation | null> => {
    if (!user) return null;

    const { data: existing } = await supabase
      .from('delegations')
      .select('id, country')
      .eq('country', country)
      .maybeSingle();

    if (existing) return existing as Delegation;

    const { data: created, error } = await supabase
      .from('delegations')
      .insert({ country, managed_by: user.id, managed_by_name: user.name })
      .select('id, country')
      .single();

    if (error || !created) { toast.error('Failed to create delegation'); return null; }
    const del = created as Delegation;
    setDelegations(prev => [...prev, del]);
    return del;
  }, [user]);

  /** Insert into delegation_members if not already present. Returns the delegation. */
  const addMember = useCallback(async (guest: Guest, delegation: Delegation): Promise<void> => {
    const { data: existing } = await supabase
      .from('delegation_members')
      .select('id')
      .eq('delegation_id', delegation.id)
      .eq('guest_id', guest.id)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('delegation_members').insert({
        delegation_id: delegation.id,
        guest_id: guest.id,
        guest_name: guest.fullName,
        is_head: false,
      });
      if (error) { toast.error('Failed to add member to delegation'); throw error; }
    }
  }, []);

  /** Remove guest from delegation_members (by guest_id regardless of delegation). */
  const removeMember = useCallback(async (guestId: string): Promise<void> => {
    await supabase.from('delegation_members').delete().eq('guest_id', guestId);
  }, []);

  /** Enable Mulaqat for a guest — auto-assigns to their own country's delegation. */
  const enableMulaqat = useCallback(async (guest: Guest) => {
    const delegation = await findOrCreate(guest.country);
    if (!delegation) return;
    await addMember(guest, delegation);
    await updateGuest(guest.id, { mulaqat: true, delegationId: delegation.id });
    toast.success('Added to delegation');
  }, [findOrCreate, addMember, updateGuest]);

  /** Disable Mulaqat — removes from delegation. */
  const disableMulaqat = useCallback(async (guest: Guest) => {
    await removeMember(guest.id);
    await updateGuest(guest.id, { mulaqat: false, delegationId: null });
    toast.success('Removed from delegation');
  }, [removeMember, updateGuest]);

  /** Move guest to a different country's delegation. */
  const changeDelegationCountry = useCallback(async (guest: Guest, newCountry: string) => {
    await removeMember(guest.id);
    const delegation = await findOrCreate(newCountry);
    if (!delegation) return;
    await addMember(guest, delegation);
    await updateGuest(guest.id, { delegationId: delegation.id });
    toast.success(`Moved to ${newCountry} delegation`);
  }, [findOrCreate, addMember, removeMember, updateGuest]);

  /** Set mulaqat type and handle delegation membership accordingly. */
  const setMulaqatType = useCallback(async (guest: Guest, type: 'No' | 'Delegation' | 'Daftari' | 'Both') => {
    if (type === 'No') {
      await removeMember(guest.id);
      await updateGuest(guest.id, { mulaqat: false, mulaqatType: 'No', delegationId: null });
      toast.success('Removed from Mulaqat');
    } else if (type === 'Delegation') {
      const delegation = await findOrCreate(guest.country);
      if (!delegation) return;
      await addMember(guest, delegation);
      await updateGuest(guest.id, { mulaqat: true, mulaqatType: 'Delegation', delegationId: delegation.id });
      toast.success('Added to Delegation');
    } else if (type === 'Daftari') {
      await removeMember(guest.id);
      await updateGuest(guest.id, { mulaqat: true, mulaqatType: 'Daftari', delegationId: null });
      toast.success('Set as Daftari');
    } else if (type === 'Both') {
      const delegation = await findOrCreate(guest.country);
      if (!delegation) return;
      await addMember(guest, delegation);
      await updateGuest(guest.id, { mulaqat: true, mulaqatType: 'Both', delegationId: delegation.id });
      toast.success('Added to Delegation and Daftari');
    }
  }, [findOrCreate, addMember, removeMember, updateGuest]);

  return { delegations, getDelegationCountry, enableMulaqat, disableMulaqat, changeDelegationCountry, setMulaqatType };
}
