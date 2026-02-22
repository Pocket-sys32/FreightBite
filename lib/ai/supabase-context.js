/**
 * Fetch a short summary from Supabase (loads, legs, drivers, contacts) for AI context.
 * Used by DispAIch / outreach-chat so the assistant can "see" Supabase data.
 * @param {import('@supabase/supabase-js').SupabaseClient | null} sb
 * @returns {Promise<string>}
 */
async function getSupabaseContext(sb) {
  if (!sb) return '';

  const parts = [];

  try {
    const [loadsRes, legsRes, driversRes, contactsRes] = await Promise.all([
      sb.from('loads').select('id, origin, destination, miles, status').limit(8).order('created_at', { ascending: false }),
      sb.from('legs').select('id, load_id, sequence, origin, destination, miles, status, driver_id').limit(15).order('created_at', { ascending: false }),
      sb.from('drivers').select('id, name, email').limit(10),
      sb.from('contacts').select('id, driver_id, broker_name, broker_email').limit(15),
    ]);

    const label = (v) => {
      if (v == null) return '?';
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && v !== null && typeof v.label === 'string') return v.label;
      return String(v);
    };

    if (loadsRes.data && loadsRes.data.length > 0) {
      parts.push('Supabase loads:');
      loadsRes.data.forEach((l) => {
        const orig = label(l.origin);
        const dest = label(l.destination);
        parts.push(`  - ${l.status || '?'} ${orig} → ${dest} ${l.miles != null ? l.miles + ' mi' : ''}`);
      });
    }

    if (legsRes.data && legsRes.data.length > 0) {
      parts.push('Supabase legs (sample):');
      legsRes.data.slice(0, 10).forEach((l) => {
        const orig = label(l.origin);
        const dest = label(l.destination);
        parts.push(`  - Leg ${l.sequence} ${l.status || '?'} ${orig} → ${dest} ${l.miles != null ? l.miles + ' mi' : ''} driver_id=${l.driver_id || 'unassigned'}`);
      });
    }

    if (driversRes.data && driversRes.data.length > 0) {
      parts.push('Supabase drivers:');
      driversRes.data.forEach((d) => {
        parts.push(`  - ${d.name} (${d.email || d.id})`);
      });
    }

    if (contactsRes.data && contactsRes.data.length > 0) {
      parts.push('Supabase contacts:');
      contactsRes.data.forEach((c) => {
        parts.push(`  - ${c.broker_name || 'Unknown'} ${c.broker_email ? `<${c.broker_email}>` : ''} driver_id=${c.driver_id || '?'}`);
      });
    }
  } catch (err) {
    parts.push(`(Supabase context error: ${err.message})`);
  }

  if (parts.length === 0) return '';
  return ['--- Supabase data (for context) ---', ...parts].join('\n');
}

module.exports = { getSupabaseContext };
