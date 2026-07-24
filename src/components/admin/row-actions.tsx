"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, Button, Flex, IconButton, Tooltip } from "@radix-ui/themes";
import { toast } from "sonner";
import { deleteProduct } from "@/app/api/admin/prodotti/actions";
import { deleteCourse } from "@/app/api/admin/corsi/actions";
import { deleteEvent } from "@/app/api/admin/eventi/actions";
import { deleteSponsor } from "@/app/api/admin/sponsors/actions";

type DeletableEntity = "product" | "course" | "event" | "sponsor";

type RowActionsProps = {
  id: string;
  editHref: string;
  label: string;
  mode?: "edit" | "view";
  deleteEntity?: DeletableEntity;
};

export function RowActions({ id, editHref, label, mode = "edit", deleteEntity }: RowActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!deleteEntity) return;
    setPending(true);
    const result =
      deleteEntity === "product" ? await deleteProduct(id) :
      deleteEntity === "course" ? await deleteCourse(id) :
      deleteEntity === "event" ? await deleteEvent(id) :
      await deleteSponsor(id);

    setPending(false);
    if (result.success) {
      toast.success(`${label} eliminato`, {
        description: "La lista è stata aggiornata.",
      });
      router.refresh();
    } else {
      toast.error("Eliminazione non riuscita", {
        description: result.error || "Controlla eventuali elementi collegati e riprova.",
      });
    }
  }

  const PrimaryIcon = mode === "view" ? Eye : Pencil;

  return (
    <Flex gap="1" justify="end">
      <Tooltip content={mode === "view" ? `Apri ${label}` : `Modifica ${label}`}>
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          aria-label={mode === "view" ? `Apri ${label}` : `Modifica ${label}`}
          onClick={() => router.push(editHref)}
        >
          <PrimaryIcon className="size-3.5" />
        </IconButton>
      </Tooltip>

      {deleteEntity && (
        <AlertDialog.Root>
          <Tooltip content={`Elimina ${label}`}>
            <AlertDialog.Trigger>
              <IconButton size="1" variant="ghost" color="red" aria-label={`Elimina ${label}`}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </AlertDialog.Trigger>
          </Tooltip>
          <AlertDialog.Content maxWidth="420px">
            <AlertDialog.Title>Eliminare {label}?</AlertDialog.Title>
            <AlertDialog.Description size="2">
              L’operazione è definitiva. Se esistono ordini, biglietti o altri contenuti collegati,
              il sistema impedirà l’eliminazione.
            </AlertDialog.Description>
            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Cancel>
                <Button variant="soft" color="gray">Annulla</Button>
              </AlertDialog.Cancel>
              <Button color="red" loading={pending} onClick={handleDelete}>
                Elimina definitivamente
              </Button>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      )}
    </Flex>
  );
}
