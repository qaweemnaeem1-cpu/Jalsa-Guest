import { useMemo, useState } from 'react';
import { MapPin, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { useDepartments } from '@/hooks/useDepartments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeptLocation {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

let nextLocationId = 100;

function seedLocations(dept: string, deptMap: Record<string, string[]>): DeptLocation[] {
  return (deptMap[dept] ?? []).map((name, i) => ({
    id: `loc-seed-${i}`,
    name,
    description: '',
    isActive: true,
  }));
}

export default function DeptLocationsPage() {
  const { user } = useAuth();
  const { guests } = useGuests();
  const { departments } = useDepartments();

  const dept = user?.department ?? '';

  const [locations, setLocations] = useState<DeptLocation[]>(() => seedLocations(dept, departments));

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DeptLocation | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formError, setFormError] = useState('');

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<DeptLocation | null>(null);

  const guestCountByLocation = useMemo(() => {
    const map: Record<string, number> = {};
    guests.forEach(g => {
      if (g.assignedDepartment === dept && g.placedLocation) {
        map[g.placedLocation] = (map[g.placedLocation] ?? 0) + 1;
      }
    });
    return map;
  }, [guests, dept]);

  const openAdd = () => {
    setEditTarget(null);
    setFormName('');
    setFormDesc('');
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (loc: DeptLocation) => {
    setEditTarget(loc);
    setFormName(loc.name);
    setFormDesc(loc.description);
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = () => {
    const trimmedName = formName.trim().replace(/<[^>]*>/g, '');
    const trimmedDesc = formDesc.trim().replace(/<[^>]*>/g, '');

    if (trimmedName.length < 2) {
      setFormError('Name must be at least 2 characters');
      return;
    }
    if (trimmedName.length > 100) {
      setFormError('Name must be 100 characters or fewer');
      return;
    }

    const duplicate = locations.find(
      l => l.name.toLowerCase() === trimmedName.toLowerCase() && l.id !== editTarget?.id,
    );
    if (duplicate) {
      setFormError('A location with this name already exists');
      return;
    }

    if (editTarget) {
      setLocations(prev =>
        prev.map(l => l.id === editTarget.id ? { ...l, name: trimmedName, description: trimmedDesc } : l),
      );
      toast.success('Location updated');
    } else {
      setLocations(prev => [
        ...prev,
        { id: `loc-${nextLocationId++}`, name: trimmedName, description: trimmedDesc, isActive: true },
      ]);
      toast.success('Location added successfully');
    }
    setDialogOpen(false);
  };

  const handleToggleActive = (id: string) => {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, isActive: !l.isActive } : l));
  };

  const handleDeleteClick = (loc: DeptLocation) => {
    const count = guestCountByLocation[loc.name] ?? 0;
    if (count > 0) {
      toast.error(`Cannot delete — ${count} guest${count !== 1 ? 's' : ''} are placed here. Reassign them first.`);
      return;
    }
    setDeleteTarget(loc);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    setLocations(prev => prev.filter(l => l.id !== deleteTarget.id));
    toast.success('Location deleted');
    setDeleteTarget(null);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <DeptSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Locations</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Manage accommodation locations for {dept}</p>
                </div>
              </div>
              <Button
                onClick={openAdd}
                className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Location
              </Button>
            </div>
          </header>

          <div className="p-6">
            {locations.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <MapPin className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-medium text-[#1A1A1A] mb-1">No locations yet</h2>
                <p className="text-sm text-[#4A4A4A] mb-4">Add your first location to start placing guests.</p>
                <Button onClick={openAdd} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Location
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider w-10">#</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Guest Count</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {locations.map((loc, idx) => {
                      const count = guestCountByLocation[loc.name] ?? 0;
                      return (
                        <tr key={loc.id} className="hover:bg-[#F9F8F6]">
                          <td className="px-4 py-3 text-[#4A4A4A]">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-[#1A1A1A]">{loc.name}</td>
                          <td className="px-4 py-3 text-[#4A4A4A]">{loc.description || <span className="text-[#D4CFC7]">—</span>}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                              count > 0
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-gray-50 text-gray-500 border-gray-200'
                            }`}>
                              {count} guest{count !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleToggleActive(loc.id)}
                              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                                loc.isActive ? 'text-green-600' : 'text-[#4A4A4A]'
                              }`}
                              title="Toggle active status"
                            >
                              {loc.isActive
                                ? <ToggleRight className="w-5 h-5" />
                                : <ToggleLeft className="w-5 h-5" />}
                              {loc.isActive ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEdit(loc)}
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors"
                                title="Edit location"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(loc)}
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="Delete location"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1A1A1A]">
              {editTarget ? 'Edit Location' : 'Add New Location'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">Name <span className="text-red-500">*</span></Label>
              <Input
                value={formName}
                onChange={e => { setFormName(e.target.value); setFormError(''); }}
                placeholder="e.g. Jamia Block A"
                className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                maxLength={100}
              />
            </div>
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">Description <span className="text-[#4A4A4A]">(optional)</span></Label>
              <Textarea
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="Brief description of this location"
                className="border-[#D4CFC7] focus:border-[#2D5A45] text-sm resize-none"
                rows={3}
              />
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm"
            >
              {editTarget ? 'Save Changes' : 'Add Location'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? Guests placed here will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
