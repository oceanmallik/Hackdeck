// js/auth.js - Authentication and Profile Management for Hackdeck
(() => {
  // Regex strictly validating 3-20 lowercase alphanumeric characters and underscores
  const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

  // State
  let currentUser = null;
  let currentProfile = null;
  let isCheckingProfile = false;

  // DOM Elements
  const btnGoogleSignIn = document.getElementById('btnGoogleSignIn');
  const btnHeroGoogleSignIn = document.getElementById('btnHeroGoogleSignIn');
  const btnSignOut = document.getElementById('btnSignOut');
  
  const authSignedOutNav = document.getElementById('authSignedOutNav');
  const authSignedInNav = document.getElementById('authSignedInNav');
  const navUserHandle = document.getElementById('navUserHandle');
  const navUserAvatar = document.getElementById('navUserAvatar');
  
  const heroSection = document.getElementById('heroSection');
  const dashboardContainer = document.getElementById('dashboardContainer');
  const dashboardGreeting = document.getElementById('dashboardGreeting');
  const dashboardAvatar = document.getElementById('dashboardAvatar');

  // Blocking Modal Elements
  const onboardingModal = document.getElementById('onboardingModal');
  const onboardingForm = document.getElementById('onboardingForm');
  const usernameInput = document.getElementById('usernameInput');
  const displayNameInput = document.getElementById('displayNameInput');
  const avatarUrlInput = document.getElementById('avatarUrlInput');
  const usernameInputWrapper = document.getElementById('usernameInputWrapper');
  const usernameValidationMsg = document.getElementById('usernameValidationMsg');
  const usernameSuggestionsList = document.getElementById('usernameSuggestionsList');
  const suggestionsWrapper = document.getElementById('suggestionsWrapper');
  const modalErrorBanner = document.getElementById('modalErrorBanner');
  const modalErrorMessage = document.getElementById('modalErrorMessage');
  const btnSubmitProfile = document.getElementById('btnSubmitProfile');
  const previewModalAvatar = document.getElementById('previewModalAvatar');
  const previewModalName = document.getElementById('previewModalName');
  const previewModalEmail = document.getElementById('previewModalEmail');

  let availabilityTimeout = null;

  const toastContainer = document.getElementById('toastContainer');

  /**
   * Display floating toast notifications
   */
  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    if (type === 'success') {
      icon = '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#10b981" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
    } else if (type === 'error') {
      icon = '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    } else {
      icon = '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3800);
  }

  // Expose toast globally
  window.showToast = showToast;

  /**
   * Google OAuth sign-in flow
   */
  async function signInWithGoogle() {
    if (!window.supabaseClient) {
      showToast('Supabase client is not initialized.', 'error');
      return;
    }

    try {
      if (btnGoogleSignIn) btnGoogleSignIn.disabled = true;
      if (btnHeroGoogleSignIn) btnHeroGoogleSignIn.disabled = true;

      const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) {
        throw error;
      }
    } catch (err) {
      console.error('Google Sign-in Error:', err);
      showToast(err.message || 'Failed to initialize Google Sign In', 'error');
      if (btnGoogleSignIn) btnGoogleSignIn.disabled = false;
      if (btnHeroGoogleSignIn) btnHeroGoogleSignIn.disabled = false;
    }
  }

  /**
   * Sign out flow
   */
  async function signOut() {
    if (!window.supabaseClient) return;
    try {
      if (btnSignOut) btnSignOut.disabled = true;
      const { error } = await window.supabaseClient.auth.signOut();
      if (error) throw error;

      currentUser = null;
      currentProfile = null;
      renderUnauthenticatedUI();
      showToast('Signed out successfully.', 'info');
    } catch (err) {
      console.error('Sign Out Error:', err);
      showToast(err.message || 'Failed to sign out', 'error');
    } finally {
      if (btnSignOut) btnSignOut.disabled = false;
    }
  }

  /**
   * Escape HTML entities for safe DOM rendering
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Generate an SVG data URI avatar placeholder with user initial
   */
  function getInitialsAvatarSvg(name, size = 32) {
    const initial = (name || 'H').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#232323"/><text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-size="${Math.round(size * 0.44)}" font-weight="600" fill="#a1a1a1" dominant-baseline="middle" text-anchor="middle">${initial}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  window.getInitialsAvatarSvg = getInitialsAvatarSvg;

  /**
   * Check public.profiles where id = user.id
   */
  async function checkUserProfile(user) {
    if (!user) {
      renderUnauthenticatedUI();
      return;
    }

    if (currentProfile && currentProfile.id === user.id) {
      return;
    }

    if (isCheckingProfile) return;
    isCheckingProfile = true;

    try {
      const { data: profile, error } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error querying profiles:', error);
      }

      if (profile && profile.username) {
        // Synchronize Google avatar if missing from public.profiles
        const meta = user.user_metadata || {};
        const googleIdentity = user.identities?.find(i => i.provider === 'google')?.identity_data || {};
        const googleAvatar = meta.avatar_url || meta.picture || googleIdentity.avatar_url || googleIdentity.picture || null;

        if (googleAvatar && (!profile.avatar_url || profile.avatar_url !== googleAvatar)) {
          profile.avatar_url = googleAvatar;
          window.supabaseClient
            .from('profiles')
            .update({ avatar_url: googleAvatar })
            .eq('id', user.id)
            .then(() => {
              console.log('Google avatar synced to profile.');
            })
            .catch(syncErr => console.warn('Avatar sync notice:', syncErr));
        }

        currentProfile = profile;
        hideOnboardingModal();
        renderAuthenticatedUI(profile);
      } else {
        // No profile row exists -> Open blocking modal to claim username
        openOnboardingModal(user);
      }
    } catch (err) {
      console.error('Profile check error:', err);
      openOnboardingModal(user);
    } finally {
      isCheckingProfile = false;
    }
  }

  /**
   * Derive candidate username suggestions strictly prioritizing user's email ID
   */
  function generateUsernameSuggestions(email, name) {
    const suggestions = new Set();
    const cleanEmail = (email || '').trim().toLowerCase();
    const emailPrefix = cleanEmail.split('@')[0] || '';

    if (emailPrefix) {
      // 1. Raw email prefix with invalid chars converted to underscores
      const s1 = emailPrefix.replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
      if (s1.length >= 3 && s1.length <= 20) suggestions.add(s1);

      // 2. Pure alphanumeric (dots/dashes/underscores removed)
      const s2 = emailPrefix.replace(/[^a-z0-9]/g, '');
      if (s2.length >= 3 && s2.length <= 20) suggestions.add(s2);

      // 3. First segment before any dot/dash/underscore/digit
      const firstSegment = emailPrefix.split(/[._\-\d]/)[0];
      if (firstSegment && firstSegment.length >= 3 && firstSegment.length <= 16) {
        suggestions.add(firstSegment);
        suggestions.add(`${firstSegment}_dev`);
      }

      // 4. Short email with dev suffix
      if (s1.length >= 3 && s1.length <= 15) {
        suggestions.add(`${s1}_dev`);
      }
    }

    // 5. Fallback from display name if fewer than 3 suggestions
    if (suggestions.size < 3 && name) {
      const nameClean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (nameClean.length >= 3 && nameClean.length <= 20) {
        suggestions.add(nameClean);
      }
      const nameUnderscore = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
      if (nameUnderscore.length >= 3 && nameUnderscore.length <= 20) {
        suggestions.add(nameUnderscore);
      }
    }

    // Filter valid handles matching USERNAME_REGEX
    const validList = Array.from(suggestions).filter(s => USERNAME_REGEX.test(s));

    // Ensure we always have at least 1 valid suggestion
    if (validList.length === 0) {
      const fallback = (emailPrefix.replace(/[^a-z0-9]/g, '') || 'hacker').substring(0, 15);
      validList.push(`${fallback || 'dev'}_1`);
    }

    return validList.slice(0, 4);
  }

  /**
   * Render clickable username suggestion chips
   */
  function renderUsernameSuggestions(suggestions, currentVal) {
    if (!usernameSuggestionsList) return;
    usernameSuggestionsList.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
      if (suggestionsWrapper) suggestionsWrapper.classList.add('hidden');
      return;
    }

    if (suggestionsWrapper) suggestionsWrapper.classList.remove('hidden');

    suggestions.forEach(s => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `suggestion-chip ${s === currentVal ? 'active' : ''}`;
      chip.setAttribute('data-username', s);
      chip.textContent = `@${s}`;
      chip.addEventListener('click', () => {
        if (usernameInput) {
          usernameInput.value = s;
          document.querySelectorAll('.suggestion-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          validateUsernameFormat(s);
          checkUsernameAvailabilityDebounced(s);
          usernameInput.focus();
        }
      });
      usernameSuggestionsList.appendChild(chip);
    });
  }

  /**
   * Check real-time username availability against Supabase profiles table
   */
  async function checkUsernameAvailability(username) {
    if (!username || !USERNAME_REGEX.test(username) || !window.supabaseClient) return;

    try {
      const { data, error } = await window.supabaseClient
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (error) return;

      // Ensure input value hasn't changed while awaiting response
      if (usernameInput && usernameInput.value.trim().toLowerCase() !== username) return;

      if (data && (!currentUser || data.id !== currentUser.id)) {
        if (usernameInputWrapper) {
          usernameInputWrapper.classList.remove('is-valid');
          usernameInputWrapper.classList.add('is-invalid');
        }
        if (usernameValidationMsg) {
          usernameValidationMsg.className = 'form-helper error-text';
          usernameValidationMsg.textContent = `✕ @${username} is already taken`;
        }
      } else {
        if (usernameInputWrapper) {
          usernameInputWrapper.classList.remove('is-invalid');
          usernameInputWrapper.classList.add('is-valid');
        }
        if (usernameValidationMsg) {
          usernameValidationMsg.className = 'form-helper success-text';
          usernameValidationMsg.textContent = `✓ @${username} is available`;
        }
      }
    } catch (err) {
      console.warn('Availability check error:', err);
    }
  }

  function checkUsernameAvailabilityDebounced(username) {
    clearTimeout(availabilityTimeout);
    if (!username || !USERNAME_REGEX.test(username)) return;
    availabilityTimeout = setTimeout(() => {
      checkUsernameAvailability(username);
    }, 250);
  }

  /**
   * Open the blocking onboarding modal
   */
  function openOnboardingModal(user) {
    if (!onboardingModal) return;

    // Immediately unhide modal so it is guaranteed visible
    onboardingModal.classList.remove('hidden');
    if (heroSection) heroSection.classList.add('hidden');
    if (dashboardContainer) dashboardContainer.classList.add('hidden');

    try {
      user = user || currentUser || {};
      const meta = user.user_metadata || {};
      const identities = Array.isArray(user.identities) ? user.identities : [];
      const googleIdentity = identities.find(i => i.provider === 'google')?.identity_data || {};
      const email = user.email || meta.email || googleIdentity.email || '';
      const displayName = meta.full_name || meta.name || googleIdentity.full_name || googleIdentity.name || (email ? email.split('@')[0] : 'Hacker');
      const avatarUrl = meta.avatar_url || meta.picture || googleIdentity.avatar_url || googleIdentity.picture || '';

      // Derive email-first suggestions
      const suggestions = generateUsernameSuggestions(email, displayName);
      const suggestedUsername = suggestions[0] || 'hacker_1';

      // Pre-fill form inputs
      if (usernameInput) usernameInput.value = suggestedUsername;
      if (displayNameInput) displayNameInput.value = displayName;
      if (avatarUrlInput) avatarUrlInput.value = avatarUrl;

      // Render suggestion chips
      renderUsernameSuggestions(suggestions, suggestedUsername);

      // Pre-fill visual user summary inside modal
      if (previewModalName) previewModalName.textContent = displayName;
      if (previewModalEmail) previewModalEmail.textContent = email || 'user@example.com';
      if (previewModalAvatar) {
        previewModalAvatar.referrerPolicy = 'no-referrer';
        previewModalAvatar.onerror = function () {
          this.onerror = null;
          this.src = getInitialsAvatarSvg(displayName, 48);
        };
        if (avatarUrl) {
          previewModalAvatar.src = avatarUrl;
        } else {
          previewModalAvatar.src = getInitialsAvatarSvg(displayName, 48);
        }
      }

      // Reset error banner
      if (modalErrorBanner) modalErrorBanner.classList.add('hidden');
      if (modalErrorMessage) modalErrorMessage.textContent = '';

      // Trigger validation & availability check
      validateUsernameFormat(suggestedUsername);
      checkUsernameAvailabilityDebounced(suggestedUsername);
    } catch (err) {
      console.error('Error populating onboarding modal:', err);
    }
  }

  window.openOnboardingModal = openOnboardingModal;
  window.checkUserProfile = checkUserProfile;

  /**
   * Hide the blocking modal
   */
  function hideOnboardingModal() {
    if (onboardingModal) {
      onboardingModal.classList.add('hidden');
    }
  }

  /**
   * Validate username format on input
   */
  function validateUsernameFormat(username) {
    const trimmed = (username || '').trim();
    const isValid = USERNAME_REGEX.test(trimmed);

    if (!trimmed) {
      usernameInputWrapper.classList.remove('is-valid', 'is-invalid');
      usernameValidationMsg.className = 'form-helper';
      usernameValidationMsg.textContent = '3-20 lowercase letters, numbers, and underscores.';
      return false;
    }

    if (isValid) {
      usernameInputWrapper.classList.remove('is-invalid');
      usernameInputWrapper.classList.add('is-valid');
      usernameValidationMsg.className = 'form-helper success-text';
      usernameValidationMsg.textContent = '✓ Handle format looks great';
      return true;
    } else {
      usernameInputWrapper.classList.remove('is-valid');
      usernameInputWrapper.classList.add('is-invalid');
      usernameValidationMsg.className = 'form-helper error-text';
      if (trimmed.length < 3 || trimmed.length > 20) {
        usernameValidationMsg.textContent = `Must be 3-20 characters (currently ${trimmed.length}).`;
      } else {
        usernameValidationMsg.textContent = 'Use only lowercase letters, numbers, and underscores (_).';
      }
      return false;
    }
  }

  /**
   * Handle Profile Form Claim submission
   */
  async function handleProfileClaim(e) {
    e.preventDefault();
    if (!currentUser) return;

    const rawUsername = usernameInput.value.trim().toLowerCase();
    const displayName = displayNameInput.value.trim() || rawUsername;
    const avatarUrl = avatarUrlInput.value.trim() || null;

    // Validate format
    if (!USERNAME_REGEX.test(rawUsername)) {
      showModalError('Username must be 3-20 characters long and contain only lowercase letters, numbers, and underscores.');
      usernameInput.focus();
      return;
    }

    btnSubmitProfile.disabled = true;
    btnSubmitProfile.textContent = 'Claiming handle...';
    modalErrorBanner.classList.add('hidden');

    try {
      // Check for uniqueness in public.profiles
      const { data: existingUser, error: checkError } = await window.supabaseClient
        .from('profiles')
        .select('id, username')
        .eq('username', rawUsername)
        .maybeSingle();

      if (checkError) {
        console.warn('Username lookup notice:', checkError);
      }

      if (existingUser && existingUser.id !== currentUser.id) {
        showModalError(`@${rawUsername} is already taken. Please choose another.`);
        btnSubmitProfile.disabled = false;
        btnSubmitProfile.textContent = 'Claim Handle & Continue';
        usernameInput.focus();
        return;
      }

      // Insert profile row into public.profiles
      const profileData = {
        id: currentUser.id,
        username: rawUsername,
        display_name: displayName,
        avatar_url: avatarUrl
      };

      const { data, error: insertError } = await window.supabaseClient
        .from('profiles')
        .insert([profileData])
        .select();

      if (insertError) {
        if (insertError.code === '23505') {
          showModalError(`@${rawUsername} is already taken. Please select a different handle.`);
        } else {
          showModalError(insertError.message || 'Unable to create profile. Please check database permissions.');
        }
        btnSubmitProfile.disabled = false;
        btnSubmitProfile.textContent = 'Claim Handle & Continue';
        return;
      }

      currentProfile = (data && data[0]) ? data[0] : profileData;
      hideOnboardingModal();
      renderAuthenticatedUI(currentProfile);
      showToast(`Welcome to Hackdeck, @${currentProfile.username}!`, 'success');
    } catch (err) {
      console.error('Profile creation error:', err);
      showModalError(err.message || 'Failed to claim username.');
    } finally {
      btnSubmitProfile.disabled = false;
      btnSubmitProfile.textContent = 'Claim Handle & Continue';
    }
  }

  function showModalError(msg) {
    modalErrorMessage.textContent = msg;
    modalErrorBanner.classList.remove('hidden');
  }

  /**
   * Render UI when authenticated with a valid profile
   */
  function renderAuthenticatedUI(profile) {
    // Top Navbar
    authSignedOutNav.classList.add('hidden');
    authSignedInNav.classList.remove('hidden');

    const usernameDisplay = `@${profile.username}`;
    if (navUserHandle) navUserHandle.textContent = usernameDisplay;

    // Avatar in Nav
    if (navUserAvatar) {
      const initial = (profile.display_name || profile.username || 'H').charAt(0).toUpperCase();
      if (profile.avatar_url) {
        navUserAvatar.innerHTML = `<img src="${profile.avatar_url}" alt="${profile.username}" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.textContent='${initial}';">`;
      } else {
        navUserAvatar.textContent = initial;
      }
    }

    // Dashboard Greeting & Avatar
    if (dashboardGreeting) {
      dashboardGreeting.textContent = `Welcome back, ${usernameDisplay}`;
    }
    if (dashboardAvatar) {
      dashboardAvatar.referrerPolicy = 'no-referrer';
      dashboardAvatar.onerror = function () {
        this.onerror = null;
        this.src = getInitialsAvatarSvg(profile.display_name || profile.username, 64);
      };
      if (profile.avatar_url) {
        dashboardAvatar.src = profile.avatar_url;
      } else {
        dashboardAvatar.src = getInitialsAvatarSvg(profile.display_name || profile.username, 64);
      }
    }

    // Reveal Hackathon Dashboard, hide Hero
    heroSection.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');

    // Expose auth state globally and notify other modules
    window.currentUser = currentUser;
    window.currentProfile = profile;
    window.dispatchEvent(new CustomEvent('hackdeck:auth-change', {
      detail: { user: currentUser, profile: profile }
    }));
  }

  /**
   * Render UI when signed out
   */
  function renderUnauthenticatedUI() {
    authSignedOutNav.classList.remove('hidden');
    authSignedInNav.classList.add('hidden');

    hideOnboardingModal();
    heroSection.classList.remove('hidden');
    dashboardContainer.classList.add('hidden');

    if (btnGoogleSignIn) btnGoogleSignIn.disabled = false;
    if (btnHeroGoogleSignIn) btnHeroGoogleSignIn.disabled = false;

    // Expose auth state globally and notify other modules
    window.currentUser = null;
    window.currentProfile = null;
    window.dispatchEvent(new CustomEvent('hackdeck:auth-change', {
      detail: { user: null, profile: null }
    }));
  }

  /**
   * Attach Listeners & Initialize
   */
  function init() {
    // Google Sign-In Buttons
    if (btnGoogleSignIn) btnGoogleSignIn.addEventListener('click', signInWithGoogle);
    if (btnHeroGoogleSignIn) btnHeroGoogleSignIn.addEventListener('click', signInWithGoogle);

    // Sign-Out Button
    if (btnSignOut) btnSignOut.addEventListener('click', signOut);

    // Profile Onboarding Form
    if (onboardingForm) onboardingForm.addEventListener('submit', handleProfileClaim);

    // Live validation for @username input
    if (usernameInput) {
      usernameInput.addEventListener('input', (e) => {
        // Enforce lowercase and underscore replacing spaces
        e.target.value = e.target.value.toLowerCase().replace(/\s+/g, '_');
        const val = e.target.value.trim();

        // Sync active state on suggestion chips
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
          if (chip.getAttribute('data-username') === val) {
            chip.classList.add('active');
          } else {
            chip.classList.remove('active');
          }
        });

        const isValid = validateUsernameFormat(val);
        if (isValid) {
          checkUsernameAvailabilityDebounced(val);
        } else {
          clearTimeout(availabilityTimeout);
        }
      });
    }

    // Listen for Auth State changes
    if (window.supabaseClient) {
      window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
          currentUser = session.user;
          await checkUserProfile(session.user);
        } else {
          currentUser = null;
          currentProfile = null;
          renderUnauthenticatedUI();
        }
      });

      // Check current session immediately
      window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session && session.user) {
          currentUser = session.user;
          checkUserProfile(session.user);
        } else {
          renderUnauthenticatedUI();
        }
      });
    } else {
      console.error('Supabase client is unavailable.');
    }
  }

  // Run init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
