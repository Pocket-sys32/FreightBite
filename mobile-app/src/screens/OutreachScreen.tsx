import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import {
  draftOutreachEmail,
  fetchDriverContacts,
  fetchLegs,
  uploadOutreachDocument,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import type { BrokerContact, Leg } from '../lib/types';

export function OutreachScreen() {
  const { driver } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<BrokerContact[]>([]);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [gapLeg, setGapLeg] = useState<Leg | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!driver) return;
    setLoading(true);
    setError(null);
    try {
      const [driverContacts, openLegs] = await Promise.all([
        fetchDriverContacts(driver.id),
        fetchLegs({ status: 'OPEN' }),
      ]);
      setContacts(driverContacts);
      setActiveContactId(driverContacts[0]?.id || null);
      setGapLeg(openLegs[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outreach data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [driver?.id]);

  const activeContact = useMemo(
    () => contacts.find((contact) => contact.id === activeContactId) || null,
    [contacts, activeContactId]
  );

  useEffect(() => {
    if (!driver || !activeContact || !gapLeg) {
      setDraftSubject('');
      setDraftBody('');
      return;
    }

    const run = async () => {
      setDrafting(true);
      setError(null);
      try {
        const draft = await draftOutreachEmail({
          driver,
          contact: activeContact,
          preferredDirection: `${gapLeg.originState} -> ${gapLeg.destinationState}`,
        });
        setDraftSubject(draft.subject);
        setDraftBody(draft.body);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to draft email');
      } finally {
        setDrafting(false);
      }
    };

    void run();
  }, [activeContact?.id, driver?.id, gapLeg?.id]);

  const uploadFiles = async () => {
    if (!driver) return;
    setUploading(true);
    setNotice(null);
    setError(null);

    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (selection.canceled || selection.assets.length === 0) {
        setUploading(false);
        return;
      }

      let successCount = 0;
      for (const asset of selection.assets) {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await uploadOutreachDocument({
          filename: asset.name || 'upload.pdf',
          contentBase64: base64,
          documentType: 'contract',
          useLlm: true,
        });
        successCount += 1;
      }

      await load();
      setNotice(`Processed ${successCount} file${successCount === 1 ? '' : 's'} and linked data to ${driver.id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload documents');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Outreach Upload + Drafting</Text>
        <Text style={styles.subtle}>Upload broker docs, scrape them, and attach results to your UUID.</Text>
        <Text style={styles.subtle}>Driver UUID: <Text style={styles.uuid}>{driver?.id}</Text></Text>
        <TouchableOpacity style={styles.primaryBtn} disabled={uploading} onPress={() => void uploadFiles()}>
          <Text style={styles.primaryBtnText}>{uploading ? 'Scraping...' : 'Upload PDF(s) to Scrape'}</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {gapLeg ? (
        <View style={styles.card}>
          <Text style={styles.section}>Gap Leg</Text>
          <Text style={styles.legTitle}>{gapLeg.origin} → {gapLeg.destination}</Text>
          <Text style={styles.subtle}>{gapLeg.miles} mi • ${gapLeg.ratePerMile.toFixed(2)}/mi</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.section}>Contacts</Text>
        <View style={styles.contactWrap}>
          {contacts.map((contact) => (
            <TouchableOpacity
              key={contact.id}
              style={[styles.contactChip, contact.id === activeContactId ? styles.contactChipActive : null]}
              onPress={() => setActiveContactId(contact.id)}
            >
              <Text style={styles.contactText}>{contact.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeContact ? (
        <View style={styles.card}>
          <Text style={styles.section}>Email Draft to {activeContact.company}</Text>
          {drafting ? <ActivityIndicator color={colors.primary} /> : null}
          <TextInput
            style={styles.input}
            value={draftSubject}
            onChangeText={setDraftSubject}
            placeholder="Subject"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            style={[styles.input, styles.inputLarge]}
            value={draftBody}
            onChangeText={setDraftBody}
            multiline
            placeholder="Email body"
            placeholderTextColor={colors.muted}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 12, paddingBottom: 24 },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  section: { color: colors.text, fontWeight: '700', fontSize: 14 },
  subtle: { color: colors.muted, fontSize: 12 },
  uuid: { color: colors.text, fontSize: 11 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.background, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 12 },
  notice: { color: colors.primary, fontSize: 12 },
  legTitle: { color: colors.text, fontWeight: '600' },
  contactWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contactChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: '#0b1220',
  },
  contactChipActive: {
    borderColor: colors.primary,
  },
  contactText: { color: colors.text, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: '#0b1220',
  },
  inputLarge: { minHeight: 160, textAlignVertical: 'top' },
});
