'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import type { CategoryNode } from '@/lib/catalog/categories';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  archivarCategoriaAction,
  restaurarCategoriaAction,
  type CategoriaActionState,
} from './actions';
import { CategoryForm, type RootOption } from './CategoryForm';
import { CategoryIcon } from '@/components/CategoryIcon';
import { categorySwatch } from '@/lib/catalog/category-style';

const INITIAL: CategoriaActionState = { ok: false };

const linkBtn =
  'rounded-control border border-line-strong px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-surface-raised disabled:opacity-60';

function ArchiveNotice({ state }: { state: CategoriaActionState }) {
  const subs = state.subcategoriasArchivadas ?? 0;
  const prods = state.productosAfectados ?? 0;
  if (subs === 0 && prods === 0) return null;
  return (
    <p className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-on-warning-soft">
      Se archivaron {subs} subcategoría{subs === 1 ? '' : 's'}. {prods} producto
      {prods === 1 ? '' : 's'} quedaron bajo una categoría archivada y conservan su categoría;
      recategorízalos en{' '}
      <Link href="/categorias/sin-categoria-activa" className="font-medium underline">
        «Productos sin categoría activa»
      </Link>
      .
    </p>
  );
}

function NodeActions({
  node,
  roots,
  isRoot,
  parentId,
}: {
  node: CategoryNode;
  roots: RootOption[];
  isRoot: boolean;
  parentId: string | null;
}) {
  const [archState, archAction, archPending] = useActionState<CategoriaActionState, FormData>(
    archivarCategoriaAction,
    INITIAL,
  );
  const [restState, restAction, restPending] = useActionState<CategoriaActionState, FormData>(
    restaurarCategoriaAction,
    INITIAL,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <CategoryForm
        mode="editar"
        roots={roots}
        initial={{
          id: node.id,
          nombre: node.nombre,
          parentId: isRoot ? null : parentId,
          icono: node.icono,
          color: node.color,
          orden: node.orden,
        }}
        triggerLabel="Editar"
        triggerClassName={linkBtn}
      />

      {isRoot && !node.archivada ? (
        <CategoryForm
          mode="crear-sub"
          roots={roots}
          parentId={node.id}
          triggerLabel="Añadir subcategoría"
          triggerClassName={linkBtn}
        />
      ) : null}

      {node.archivada ? (
        <form action={restAction}>
          <input type="hidden" name="id" value={node.id} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            pending={restPending}
            pendingLabel="Restaurando…"
          >
            Restaurar
          </Button>
        </form>
      ) : (
        <>
          <form ref={formRef} action={archAction}>
            <input type="hidden" name="id" value={node.id} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              pending={archPending}
              pendingLabel="Archivando…"
              onClick={() => {
                if (isRoot) setConfirmOpen(true);
                else formRef.current?.requestSubmit();
              }}
            >
              Archivar
            </Button>
          </form>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="¿Archivar esta categoría?"
            description="Se archivará esta categoría y todas sus subcategorías. Los productos conservan su categoría y podrás recategorizarlos después."
            confirmLabel="Archivar"
            pending={archPending}
            onConfirm={() => {
              setConfirmOpen(false);
              formRef.current?.requestSubmit();
            }}
          />
        </>
      )}

      {archState.formError ? (
        <p className="w-full text-xs text-on-danger-soft">{archState.formError}</p>
      ) : null}
      {restState.formError ? (
        <p className="w-full text-xs text-on-danger-soft">{restState.formError}</p>
      ) : null}
      <div className="w-full">
        <ArchiveNotice state={archState} />
      </div>
    </div>
  );
}

function NodeCard({
  node,
  roots,
  isRoot,
  parentId = null,
}: {
  node: CategoryNode;
  roots: RootOption[];
  isRoot: boolean;
  parentId?: string | null;
}) {
  return (
    <div className={isRoot ? '' : 'ml-6 border-l border-line pl-4'}>
      <div className="rounded-card border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              'inline-flex h-8 w-8 items-center justify-center rounded-control ' +
              categorySwatch(node.color, node.nombre).soft +
              ' ' +
              categorySwatch(node.color, node.nombre).icon
            }
          >
            <CategoryIcon name={node.icono} width={18} height={18} />
          </span>
          <span className={isRoot ? 'font-semibold text-ink' : 'font-medium text-ink'}>
            {node.nombre}
          </span>
          <span className="text-xs text-ink-subtle">
            {node.productosCount} producto{node.productosCount === 1 ? '' : 's'}
          </span>
          {node.archivada ? <Badge tone="neutral">Archivada</Badge> : null}
        </div>
        <NodeActions node={node} roots={roots} isRoot={isRoot} parentId={parentId} />
      </div>
      {node.hijos.length > 0 ? (
        <div className="mt-2 space-y-2">
          {node.hijos.map((h) => (
            <NodeCard key={h.id} node={h} roots={roots} isRoot={false} parentId={node.id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CategoryTree({ tree, roots }: { tree: CategoryNode[]; roots: RootOption[] }) {
  if (tree.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState message="No hay categorías todavía." />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {tree.map((node) => (
        <NodeCard key={node.id} node={node} roots={roots} isRoot />
      ))}
    </div>
  );
}
