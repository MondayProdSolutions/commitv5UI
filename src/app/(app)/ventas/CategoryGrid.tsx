'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/CategoryIcon';
import { categorySwatch } from '@/lib/catalog/category-style';
import type { CategoryNode } from '@/lib/catalog/categories';
import {
  productosDeCategoriaAction,
  variantesDeProductoAction,
  type ProductoGridRow,
  type ProductosCategoriaState,
  type VarianteLite,
  type VariantesProductoState,
} from './actions';
import { money, type AddItem } from './types';
import { VariantPicker } from './VariantPicker';

const PRODUCTOS_INITIAL: ProductosCategoriaState = { ok: false, productos: [] };
const VARIANTES_INITIAL: VariantesProductoState = { ok: false, variantes: [] };

function precioLabel(p: ProductoGridRow): string {
  if (p.nVariantes === 0) return '—';
  return p.precioMin === p.precioMax
    ? money(p.precioMin)
    : `${money(p.precioMin)} – ${money(p.precioMax)}`;
}

function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Acceso rápido táctil por mosaicos grandes (estilo Toast/Clover). Navegación
 * por niveles con miga de pan:
 *   Inicio → (subcategorías, si las hay) → productos.
 * La búsqueda por texto/código de barras vive aparte, en `ProductSearchInput`.
 */
type Vista =
  | { nivel: 'inicio' }
  | { nivel: 'sub'; rootId: string }
  | { nivel: 'productos'; rootId: string; catId: string };

const TILE_BASE =
  'group flex min-h-[132px] flex-col items-start justify-between gap-3 rounded-card border border-line p-4 text-left ' +
  'transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4';

function CategoryTile({ node, onClick }: { node: CategoryNode; onClick: () => void }) {
  const sw = categorySwatch(node.color, node.nombre);
  return (
    <button type="button" onClick={onClick} className={`${TILE_BASE} ${sw.tile}`}>
      <span
        className={`inline-flex h-12 w-12 items-center justify-center rounded-control bg-surface ${sw.icon}`}
      >
        <CategoryIcon name={node.icono} width={26} height={26} />
      </span>
      <span>
        <span className="block text-[15px] font-bold leading-tight">{node.nombre}</span>
        <span className="mt-0.5 block text-xs font-medium opacity-70">
          {contar(node.productosCount, 'producto', 'productos')}
          {node.hijos.length > 0 ? ` · ${contar(node.hijos.length, 'subcat.', 'subcat.')}` : ''}
        </span>
      </span>
    </button>
  );
}

function VerTodoTile({ nombre, onClick }: { nombre: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${TILE_BASE} bg-surface-raised text-ink`}>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-control bg-surface text-ink-muted">
        <CategoryIcon name="general" width={26} height={26} />
      </span>
      <span>
        <span className="block text-[15px] font-bold leading-tight">Ver todo</span>
        <span className="mt-0.5 block text-xs font-medium opacity-70">
          Todos los productos de {nombre}
        </span>
      </span>
    </button>
  );
}

export function CategoryGrid({
  tree,
  onAdd,
}: {
  tree: CategoryNode[];
  onAdd: (item: AddItem) => void;
}) {
  const [vista, setVista] = useState<Vista>({ nivel: 'inicio' });

  const [productos, setProductos] = useState<ProductoGridRow[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(false);

  const [picker, setPicker] = useState<{ id: string; nombre: string } | null>(null);
  const [modalVariantes, setModalVariantes] = useState<VarianteLite[]>([]);
  const [loadingVariantes, setLoadingVariantes] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const root = useMemo(
    () => (vista.nivel === 'inicio' ? null : tree.find((c) => c.id === vista.rootId) ?? null),
    [tree, vista],
  );
  const subActual =
    vista.nivel === 'productos' && root
      ? root.hijos.find((h) => h.id === vista.catId) ?? null
      : null;

  async function fetchProductos(id: string) {
    setLoadingProductos(true);
    setProductos([]);
    setError(null);
    setInfo(null);
    try {
      const fd = new FormData();
      fd.set('categoryId', id);
      const res = await productosDeCategoriaAction(PRODUCTOS_INITIAL, fd);
      if (!res.ok) {
        setError('No se pudieron cargar los productos. Reintenta.');
        return;
      }
      setProductos(res.productos);
    } catch {
      setError('No se pudieron cargar los productos. Reintenta.');
    } finally {
      setLoadingProductos(false);
    }
  }

  function goInicio() {
    setVista({ nivel: 'inicio' });
    setProductos([]);
    setError(null);
    setInfo(null);
  }

  function openRoot(node: CategoryNode) {
    setError(null);
    setInfo(null);
    if (node.hijos.length > 0) {
      setVista({ nivel: 'sub', rootId: node.id });
      setProductos([]);
    } else {
      setVista({ nivel: 'productos', rootId: node.id, catId: node.id });
      void fetchProductos(node.id);
    }
  }

  function goRoot() {
    if (!root) return goInicio();
    if (root.hijos.length > 0) {
      setVista({ nivel: 'sub', rootId: root.id });
      setProductos([]);
    } else {
      setVista({ nivel: 'productos', rootId: root.id, catId: root.id });
      void fetchProductos(root.id);
    }
  }

  function openCategoria(catId: string) {
    if (!root) return;
    setVista({ nivel: 'productos', rootId: root.id, catId });
    void fetchProductos(catId);
  }

  async function clickProducto(p: ProductoGridRow) {
    setPicker({ id: p.id, nombre: p.nombre });
    setModalVariantes([]);
    setError(null);
    setInfo(null);
    setLoadingVariantes(true);
    try {
      const fd = new FormData();
      fd.set('productId', p.id);
      const res = await variantesDeProductoAction(VARIANTES_INITIAL, fd);
      if (!res.ok) {
        setPicker(null);
        setError('No se pudieron cargar las variantes. Reintenta.');
        return;
      }
      if (res.variantes.length === 0) {
        setPicker(null);
        setInfo('Este producto no tiene variantes disponibles.');
        return;
      }
      if (res.variantes.length === 1) {
        const v = res.variantes[0]!;
        onAdd({
          variantId: v.id,
          productoNombre: p.nombre,
          varianteNombre: v.nombre,
          precioConImpuesto: v.precioConImpuesto,
          stock: v.stock,
        });
        setPicker(null);
        return;
      }
      setModalVariantes(res.variantes);
    } catch {
      setPicker(null);
      setError('No se pudieron cargar las variantes. Reintenta.');
    } finally {
      setLoadingVariantes(false);
    }
  }

  function onPickVariante(v: VarianteLite) {
    if (!picker) return;
    onAdd({
      variantId: v.id,
      productoNombre: picker.nombre,
      varianteNombre: v.nombre,
      precioConImpuesto: v.precioConImpuesto,
      stock: v.stock,
    });
    setPicker(null);
  }

  const crumbBtn =
    'inline-flex min-h-9 items-center gap-1 rounded-control px-2 font-semibold text-ink-muted ' +
    'transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Card className="space-y-4">
      {/* Miga de pan / cabecera */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={goInicio} className={crumbBtn}>
          {vista.nivel !== 'inicio' ? <span aria-hidden="true">‹</span> : null}
          Inicio
        </button>
        {root ? (
          <>
            <span aria-hidden="true" className="text-ink-subtle">
              /
            </span>
            {vista.nivel === 'productos' ? (
              <button type="button" onClick={goRoot} className={crumbBtn}>
                {root.nombre}
              </button>
            ) : (
              <span className="px-2 font-semibold text-ink">{root.nombre}</span>
            )}
          </>
        ) : null}
        {subActual ? (
          <>
            <span aria-hidden="true" className="text-ink-subtle">
              /
            </span>
            <span className="px-2 font-semibold text-ink">{subActual.nombre}</span>
          </>
        ) : null}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {info ? <p className="text-sm text-ink-subtle">{info}</p> : null}

      {/* Nivel: Inicio — mosaicos de categoría raíz */}
      {vista.nivel === 'inicio' ? (
        tree.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-subtle">
            No hay categorías. Créalas en Categorías para el acceso rápido.
          </p>
        ) : (
          <div className={GRID}>
            {tree.map((node) => (
              <CategoryTile key={node.id} node={node} onClick={() => openRoot(node)} />
            ))}
          </div>
        )
      ) : null}

      {/* Nivel: Subcategorías */}
      {vista.nivel === 'sub' && root ? (
        <div className={GRID}>
          <VerTodoTile nombre={root.nombre} onClick={() => openCategoria(root.id)} />
          {root.hijos.map((h) => (
            <CategoryTile key={h.id} node={h} onClick={() => openCategoria(h.id)} />
          ))}
        </div>
      ) : null}

      {/* Nivel: Productos */}
      {vista.nivel === 'productos' ? (
        loadingProductos ? (
          <p className="py-6 text-center text-sm text-ink-subtle">Cargando productos…</p>
        ) : error ? null : productos.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-subtle">
            Sin productos activos en esta categoría.
          </p>
        ) : (
          <div className={GRID}>
            {productos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void clickProducto(p)}
                className="group flex min-h-[140px] flex-col overflow-hidden rounded-card border border-line bg-surface text-left shadow-card transition active:scale-[0.98] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <div className="flex h-24 w-full shrink-0 items-center justify-center bg-surface-sunken">
                  {p.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura de catálogo desde URL arbitraria; next/image no aporta aquí
                    <img
                      src={p.imagenUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-ink-subtle">
                      {p.nombre.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between gap-1 p-3">
                  <span className="line-clamp-2 text-sm font-semibold text-ink">{p.nombre}</span>
                  <span className="tabular-nums text-sm font-bold text-ink">{precioLabel(p)}</span>
                </div>
              </button>
            ))}
          </div>
        )
      ) : null}

      {picker && (loadingVariantes || modalVariantes.length > 1) ? (
        <VariantPicker
          productoNombre={picker.nombre}
          variantes={modalVariantes}
          loading={loadingVariantes}
          onPick={onPickVariante}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </Card>
  );
}
