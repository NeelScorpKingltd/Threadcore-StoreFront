import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, Package, MapPin, ShoppingBag } from "lucide-react";
import styles from "./StoreChat.module.css";

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
export const money = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value / 100) : "";
const validId = (value: unknown) => /^[a-f0-9-]{36}$/i.test(text(value));

export function ChatResult({ tool, data, onAction }: { tool: string; data: unknown; onAction?: (tool: string, id: string, address?: Row) => void }) {
  const envelope = row(data);
  const structured = row(envelope.structuredContent);
  const value = "data" in structured ? structured.data : data;
  const record = row(value);
  if (envelope.isError) return <p className={styles.resultNote}>This action couldn’t be completed. Please check your account or try again.</p>;
  if (tool === "catalog_read") {
    const products = (Array.isArray(value) ? value : value ? [value] : []).map(row);
    return <div className={styles.productGrid}>{products.length ? products.map((product, index) => {
      const image = text(product.imageUrl);
      const safeImage = image.startsWith("https://images.unsplash.com/");
      return <article className={styles.product} key={text(product.id) || index}>
        <div className={styles.productImage}>{safeImage ? <Image src={image} alt={text(product.title)} width={400} height={460} /> : <ShoppingBag size={28} />}
          <span className={styles.stock}>{typeof product.inventoryCount === "number" && product.inventoryCount <= 0 ? "Sold out" : "In collection"}</span></div>
        <div className={styles.productBody}><span className={styles.eyebrow}>{text(product.category) || "ThreadCore"}</span><h4>{text(product.title)}</h4><div className={styles.productBottom}><strong>{money(product.priceCents)}</strong>{validId(product.id) && <Link href={`/products/${product.id}`} aria-label={`View ${text(product.title)}`}><ArrowUpRight size={18} /></Link>}</div></div>
      </article>;
    }) : <p className={styles.resultNote}>No matching pieces found. Try a different search.</p>}</div>;
  }
  if (tool === "cart_read") {
    const items = Array.isArray(record.items) ? record.items.map(row) : [];
    return <div className={styles.summaryCard}><div className={styles.summaryHeading}><ShoppingBag size={17} /><strong>Your selection</strong><span>{items.length} {items.length === 1 ? "piece" : "pieces"}</span></div>
      {items.map((item, index) => { const product = row(item.product); return <div className={styles.lineItem} key={text(item.id) || index}><div><strong>{text(product.title)}</strong><small>Quantity {String(item.quantity ?? "")}</small></div><span>{money(typeof product.priceCents === "number" && typeof item.quantity === "number" ? product.priceCents * item.quantity : undefined)}</span></div>; })}
      {!items.length && <p className={styles.resultNote}>Your cart is ready for a little inspiration.</p>}
      <div className={styles.total}><span>Subtotal</span><strong>{money(record.subtotalCents)}</strong></div><Link className={styles.checkoutLink} href="/checkout">Review at checkout <ArrowUpRight size={15} /></Link></div>;
  }
  if (tool === "profile_read") return <div className={styles.summaryCard}><span className={styles.eyebrow}>Your profile</span><h3>{text(record.displayName) || "Welcome to ThreadCore"}</h3><p className={styles.resultNote}>Only visible in your private workspace.</p></div>;
  if (tool === "addresses_read") {
    const addresses = Array.isArray(value) ? value.map(row) : [];
    return <div className={styles.privateList}>{addresses.length ? addresses.map((address, index) => <article className={styles.summaryCard} key={text(address.id) || index}><div className={styles.summaryHeading}><MapPin size={16} /><strong>{address.isDefault ? "Default address" : "Saved address"}</strong></div><p>{[address.street, address.city, address.state, address.postalCode, address.country].map(text).filter(Boolean).join(", ")}</p>{validId(address.id) && onAction && <button className={styles.textButton} onClick={() => onAction("addresses_edit", text(address.id), address)}>Edit address <ArrowUpRight size={13} /></button>}{validId(address.id) && onAction && <button className={styles.textButton} onClick={() => onAction("addresses_write", text(address.id))}>Request removal <ArrowUpRight size={13} /></button>}</article>) : <p className={styles.resultNote}>No saved addresses yet.</p>}</div>;
  }
  if (tool === "orders_read") {
    const orders = (Array.isArray(value) ? value : value ? [value] : []).map(row);
    return <div className={styles.privateList}>{orders.length ? orders.map((order, index) => <article className={styles.summaryCard} key={text(order.id) || index}><div className={styles.summaryHeading}><Package size={16} /><strong>{text(order.orderNumber) || "Your order"}</strong></div><div className={styles.orderMeta}><span className={styles.tag}>{text(order.status).toLowerCase()}</span><strong>{money(order.totalAmountCents)}</strong></div>{Array.isArray(order.items) && order.items.map((value, i) => { const item = row(value); return <p className={styles.resultNote} key={i}>{text(row(item.product).title)} · {String(item.quantity ?? "")} × {money(item.unitPriceCents)}</p>; })}{validId(order.id) && onAction && ["CONFIRMED", "PROCESSING"].includes(text(order.status)) && <button className={styles.textButton} onClick={() => onAction("orders_write", text(order.id))}>Request cancellation <ArrowUpRight size={13} /></button>}</article>) : <p className={styles.resultNote}>No orders to show yet.</p>}</div>;
  }
  return <div className={styles.successNote}><Check size={17} /><span>{record.status === "AWAITING_CONFIRMATION" ? "Proposal ready. Load your confirmation below to review it." : tool === "cart_write" ? "Your cart has been updated." : "Your request has been received."}</span></div>;
}
