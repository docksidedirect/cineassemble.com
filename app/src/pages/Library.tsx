import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Package,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  api,
  mediaUrl,
  type Product,
  type ReferenceAsset,
} from "../api";
import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  PageHeader,
} from "../components/ui";

export default function LibraryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const result = await api.library();
    setProducts(result.products);
    setReferences(result.references);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const uploadProduct = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    try {
      const csrf = await api.csrf();
      api.setCsrf(csrf.csrfToken);
    } catch {
      toast.error("Could not prepare upload. Please refresh the page.");
      return;
    }

    setUploadingProduct(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", file.name.replace(/\.[^/.]+$/, ""));
        const result = await api.uploadProduct(formData);
        setProducts((prev) => [result.product, ...prev]);
      }
      toast.success("Product uploaded.");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Upload failed.",
      );
    } finally {
      setUploadingProduct(false);
      if (productInputRef.current) productInputRef.current.value = "";
    }
  };

  const uploadReference = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    try {
      const csrf = await api.csrf();
      api.setCsrf(csrf.csrfToken);
    } catch {
      toast.error("Could not prepare upload. Please refresh the page.");
      return;
    }

    setUploadingReference(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", file.name.replace(/\.[^/.]+$/, ""));
        // FIXED: send "referenceType" instead of "kind"
        formData.append("referenceType", "character");
        const result = await api.uploadReference(formData);
        setReferences((prev) => [result.reference, ...prev]);
      }
      toast.success("Reference uploaded.");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Upload failed.",
      );
    } finally {
      setUploadingReference(false);
      if (referenceInputRef.current) referenceInputRef.current.value = "";
    }
  };

  const deleteProduct = async (id: string) => {
    if (!window.confirm("Delete this product?")) return;
    setDeletingId(id);
    try {
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Product deleted.");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Delete failed.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const deleteReference = async (id: string) => {
    if (!window.confirm("Delete this reference?")) return;
    setDeletingId(id);
    try {
      await api.deleteReference(id);
      setReferences((prev) => prev.filter((r) => r.id !== id));
      toast.success("Reference deleted.");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Delete failed.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <LoadingBlock label="Loading your library…" />;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Asset library"
        title="Product & character library"
        description="Upload products and character references once, then reuse them across every production."
      />

      {/* Products */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Products</h2>
            <p className="text-sm text-zinc-500">
              Real products for strict-fidelity promotional films.
            </p>
          </div>
          <div className="relative">
            <input
              ref={productInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => uploadProduct(e.target.files)}
            />
            <Button
              variant="secondary"
              loading={uploadingProduct}
              onClick={() => productInputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              {uploadingProduct ? "Uploading…" : "Add product"}
            </Button>
          </div>
        </div>

        {products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Upload a clean photograph of your real product to unlock strict product-preserving promotional films."
            action={
              <Button onClick={() => productInputRef.current?.click()}>
                <Upload className="mr-1.5 h-4 w-4" /> Add first product
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <Card key={product.id} className="group relative overflow-hidden">
                <div className="aspect-[4/3] bg-white/[0.03]">
                  <img
                    src={mediaUrl(product.originalAssetId)}
                    alt={product.name}
                    className="h-full w-full object-contain p-4"
                  />
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-semibold text-white">
                    {product.name}
                  </p>
                  <p className="mt-1 text-xs text-emerald-300">
                    {product.strictFidelity
                      ? "Strict fidelity"
                      : "Reference fidelity"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteProduct(product.id)}
                  className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-zinc-400 opacity-0 transition hover:text-red-300 group-hover:opacity-100"
                  title="Delete product"
                >
                  <Trash2
                    className={`h-3.5 w-3.5 ${deletingId === product.id ? "animate-pulse" : ""}`}
                  />
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* References */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Characters & references
            </h2>
            <p className="text-sm text-zinc-500">
              Save characters, people, and style boards so every episode in a
              series starts from the same visual source.
            </p>
          </div>
          <div className="relative">
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => uploadReference(e.target.files)}
            />
            <Button
              variant="secondary"
              loading={uploadingReference}
              onClick={() => referenceInputRef.current?.click()}
            >
              <ImageIcon className="mr-1.5 h-4 w-4" />
              {uploadingReference ? "Uploading…" : "Add reference"}
            </Button>
          </div>
        </div>

        {references.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No recurring references yet"
            description="Save characters, people, and style boards so every episode in a series starts from the same visual source."
            action={
              <Button onClick={() => referenceInputRef.current?.click()}>
                <ImageIcon className="mr-1.5 h-4 w-4" /> Add reference
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {references.map((ref) => (
              <Card key={ref.id} className="group relative overflow-hidden">
                <div className="aspect-square bg-black/20">
                  <img
                    src={mediaUrl(ref.assetId)}
                    alt={ref.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-semibold text-white">
                    {ref.name}
                  </p>
                  <p className="mt-1 text-xs capitalize text-zinc-500">
                    {ref.kind}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteReference(ref.id)}
                  className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-zinc-400 opacity-0 transition hover:text-red-300 group-hover:opacity-100"
                  title="Delete reference"
                >
                  <Trash2
                    className={`h-3.5 w-3.5 ${deletingId === ref.id ? "animate-pulse" : ""}`}
                  />
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
