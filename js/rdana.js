document.addEventListener('DOMContentLoaded', () => {
  // Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyDJxMv8GCaMvQT2QBW3CdzA3dV5X_T2KqQ",
    authDomain: "bayanihan-5ce7e.firebaseapp.com",
    databaseURL: "https://bayanihan-5ce7e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bayanihan-5ce7e",
    storageBucket: "bayanihan-5ce7e.appspot.com",
    messagingSenderId: "593123849917",
    appId: "1:593123849917:web:eb85a63a536eeff78ce9d4",
    measurementId: "G-ZTQ9VXXVV0",
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  const database = firebase.database();
  const auth = firebase.auth();

  // Form data variables
  let profileData = {};
  let affectedCommunities = [];
  let needsChecklist = [];
  let summary = "";
  let structureStatus = [];
  let otherNeeds = "";
  let estQty = "";
  let responseGroup = "";
  let reliefDeployed = "";
  let familiesServed = "";
  let currentUserGroupName = '';
  let currentUserUid = '';
  let canSubmit = false; // NEW: Flag to control submission eligibility

  const submittedReportsContainer = document.getElementById("submittedReportsContainer");
  const paginationContainer = document.getElementById("pagination");
  const entriesInfo = document.getElementById("entriesInfo");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");

  // Helper function to sanitize keys for Firebase
  function sanitizeKey(key) {
    return key
      .replace(/[.#$/[\]]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '');
  }

  // Variables for inactivity detection --------------------------------------------------------------------
let inactivityTimeout;
const INACTIVITY_TIME = 1800000; // 30 minutes in milliseconds

  // Function to reset the inactivity timer
  function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(checkInactivity, INACTIVITY_TIME);
    console.log("Inactivity timer reset.");
  }

  // Function to check for inactivity and prompt the user
  function checkInactivity() {
    Swal.fire({
      title: 'Are you still there?',
      text: 'You\'ve been inactive for a while. Do you want to continue your session or log out?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Stay Login',
      cancelButtonText: 'Log Out',
      allowOutsideClick: false,
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        resetInactivityTimer();
        console.log("User chose to continue session.");
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        auth.signOut().then(() => {
          console.log("User logged out due to inactivity.");
          window.location.href = "../pages/login.html";
        }).catch((error) => {
          console.error("Error logging out:", error);
          Swal.fire('Error', 'Failed to log out. Please try again.', 'error');
        });
      }
    });
  }

  // Attach event listeners to detect user activity
  ['mousemove', 'keydown', 'scroll', 'click'].forEach(eventType => {
    document.addEventListener(eventType, resetInactivityTimer);
  });

  // Check if user is authenticated and determine submission eligibility
  auth.onAuthStateChanged(async user => {
    if (!user) {
      Swal.fire({
        icon: 'error',
        title: 'Authentication Required',
        text: 'Please sign in to access RDANA reports.',
      }).then(() => {
        window.location.href = "../pages/login.html";
      });
      return;
    }

    resetInactivityTimer();
    console.log('Logged-in user UID:', user.uid);
    currentUserUid = user.uid;

    const profilePage = 'profile.html';

    try {
      // Fetch user data from the database
      const userSnapshot = await database.ref(`users/${user.uid}`).once("value");
      const userDataFromDb = userSnapshot.val();

      if (!userDataFromDb) {
        console.error('User data not found for UID:', user.uid);
        Swal.fire({
          icon: 'error',
          title: 'User Data Missing',
          text: 'Your user profile is incomplete. Please contact support.',
        }).then(() => {
          window.location.href = "../pages/login.html";
        });
        return;
      }

      // Password reset check
      const passwordNeedsReset = userDataFromDb.password_needs_reset || false;
      if (passwordNeedsReset) {
        console.log(`Password change required for user ${user.uid}. Redirecting to profile page.`);
        Swal.fire({
          icon: 'info',
          title: 'Password Change Required',
          text: 'For security reasons, please change your password. You will be redirected to your profile.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true
        }).then(() => {
          window.location.replace(`../pages/${profilePage}`);
        });
        return;
      }

      // Get user role and organization
      const currentUserRole = userDataFromDb.role;
      currentUserGroupName = userDataFromDb.organization || 'Unknown Group';
      console.log('User Role:', currentUserRole, 'Organization:', currentUserGroupName);

      // NEW: Role-based submission eligibility check
      const submitBtn = document.getElementById("submitReportBtn");
      if (currentUserRole === 'AB ADMIN') {
        console.log('AB ADMIN role detected. Submission allowed.');
        canSubmit = true;
        if (submitBtn) submitBtn.disabled = false; // Ensure button is enabled
      } else if (currentUserRole === 'ABVN') {
        console.log('ABVN role detected. Checking organization activations.');
        if (currentUserGroupName === 'Unknown Group') {
          console.warn('ABVN user has no organization assigned.');
          Swal.fire({
            icon: 'warning',
            title: 'Organization Not Assigned',
            text: 'Your account is not associated with an organization. Redirecting to dashboard.',
          }).then(() => {
            window.location.href = '../pages/dashboard.html';
          });
          return;
        }

        // Check for active activations
        const organizationActivationsSnapshot = await database.ref("activations")
          .orderByChild("organization")
          .equalTo(currentUserGroupName)
          .once('value');

        let organizationHasActiveActivations = false;
        organizationActivationsSnapshot.forEach(childSnapshot => {
          if (childSnapshot.val().status === "active") {
            organizationHasActiveActivations = true;
            return true; // Exit loop early
          }
        });

        if (organizationHasActiveActivations) {
          console.log(`Organization "${currentUserGroupName}" has active operations. Submission allowed.`);
          canSubmit = true;
          if (submitBtn) submitBtn.disabled = false;
        } else {
          console.warn(`Organization "${currentUserGroupName}" has no active operations. Submission disabled.`);
          canSubmit = false;
          if (submitBtn) {
            submitBtn.disabled = true; // Disable submit button
            Swal.fire({
              icon: 'warning',
              title: 'Inactive Organization',
              text: 'Your organization has no active operations. You cannot submit reports at this time.',
              timer: 3000,
              didClose: () => {
                window.location.href = '../pages/dashboard.html';
              }
            });
          }
        }
      } else {
        console.warn(`Unsupported role: ${currentUserRole}. Submission disabled.`);
        canSubmit = false;
        if (submitBtn) submitBtn.disabled = true;
        Swal.fire({
          icon: 'error',
          title: 'Unauthorized Access',
          text: 'Your role does not permit report submission. Redirecting to dashboard.',
        }).then(() => {
          window.location.href = '../pages/dashboard.html';
        });
        return;
      }

      // Load reports if elements exist
      if (submittedReportsContainer && paginationContainer && entriesInfo && searchInput && sortSelect) {
        loadSubmittedReports(user.uid);
      }
    } catch (error) {
      console.error("Error checking user data or activations:", error);
      Swal.fire({
        icon: 'error',
        title: 'Authentication Error',
        text: 'Failed to verify account status. Please try logging in again.',
      }).then(() => {
        window.location.href = '../pages/login.html';
      });
    }
  });

  // Input Validations
  function validatePageInputs(pageSelector) {
    const inputs = document.querySelectorAll(`${pageSelector} input[required], ${pageSelector} select[required], ${pageSelector} textarea[required]`);
    let isValid = true;

    inputs.forEach(input => {
      const errorMessage = input.nextElementSibling;
      if (!input.value.trim()) {
        isValid = false;
        input.classList.add("input-error");
        if (errorMessage && errorMessage.classList.contains("error-message")) {
          errorMessage.textContent = "This field is required.";
          errorMessage.style.display = "block";
        }
      } else {
        input.classList.remove("input-error");
        if (errorMessage && errorMessage.classList.contains("error-message")) {
          errorMessage.style.display = "none";
        }
      }
    });

    return isValid;
  }

  // Input validation for text fields
  document.querySelectorAll('input[type="text"]').forEach(input => {
    input.addEventListener('input', function () {
      this.value = this.value.charAt(0).toUpperCase() + this.value.slice(1);
      if (this.placeholder.includes('Name') || this.placeholder.includes('Organization')) {
        this.value = this.value.replace(/[^a-zA-Z\s,-]/g, '');
      }
      if (this.id === 'affectedBarangayInput') {
        this.value = this.value.replace(/[^a-zA-Z0-9\s,-]/g, '');
      } else if (this.placeholder.includes('Name') || this.placeholder.includes('Organization') || (this.id === 'OthersInput')) {
        this.value = this.value.replace(/[^a-zA-Z\s,-]/g, '');
      } else if (this.placeholder.includes('City/Municipality') || this.placeholder.includes('Province') || this.placeholder.includes('Relief Assistance') || this.placeholder.includes('Items') || this.placeholder.includes('Barangay')) {
        this.value = this.value.replace(/[^a-zA-Z\s,-]/g, '');
      } else {
        this.value = this.value.replace(/[^a-zA-Z\s]/g, '');
      }
      if (this.type === 'number') {
        if (this.value < 0) this.value = '';
      }
    });
  });

  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  function formatTime(date) {
    return date.toTimeString().slice(0, 5);
  }

  function setupInfoGatheredValidation(occurrenceDateInput, occurrenceTimeInput, infoDateInput, infoTimeInput) {
    function updateInfoLimits() {
      if (!occurrenceDateInput.value || !occurrenceTimeInput.value) return;
      const [oYear, oMonth, oDay] = occurrenceDateInput.value.split('-').map(Number);
      const [oHour, oMinute] = occurrenceTimeInput.value.split(':').map(Number);
      const occurrenceDateTime = new Date(oYear, oMonth - 1, oDay, oHour, oMinute);
      const minDateTime = new Date(occurrenceDateTime.getTime() + 24 * 60 * 60 * 1000);
      const maxDateTime = new Date(occurrenceDateTime.getTime() + 48 * 60 * 60 * 1000);
      infoDateInput.min = formatDate(minDateTime);
      infoDateInput.max = formatDate(maxDateTime);
      if (!infoDateInput.value) infoDateInput.value = formatDate(minDateTime);
      const selectedInfoDate = new Date(infoDateInput.value + 'T00:00');
      if (selectedInfoDate.toDateString() === minDateTime.toDateString()) {
        infoTimeInput.min = formatTime(minDateTime);
        infoTimeInput.max = "23:59";
      } else if (selectedInfoDate.toDateString() === maxDateTime.toDateString()) {
        infoTimeInput.min = "00:00";
        infoTimeInput.max = formatTime(maxDateTime);
      } else {
        infoTimeInput.min = "00:00";
        infoTimeInput.max = "23:59";
      }
      if (infoTimeInput.value) {
        if (infoTimeInput.value < infoTimeInput.min || infoTimeInput.value > infoTimeInput.max) {
          infoTimeInput.value = "";
        }
      }
    }

    function validateInfoDateTime() {
      if (!occurrenceDateInput.value || !occurrenceTimeInput.value || !infoDateInput.value || !infoTimeInput.value) return;
      const [oYear, oMonth, oDay] = occurrenceDateInput.value.split('-').map(Number);
      const [oHour, oMinute] = occurrenceTimeInput.value.split(':').map(Number);
      const occurrenceDateTime = new Date(oYear, oMonth - 1, oDay, oHour, oMinute);
      const [iYear, iMonth, iDay] = infoDateInput.value.split('-').map(Number);
      const [iHour, iMinute] = infoTimeInput.value.split(':').map(Number);
      const infoDateTime = new Date(iYear, iMonth - 1, iDay, iHour, iMinute);
      const minDateTime = new Date(occurrenceDateTime.getTime() + 24 * 60 * 60 * 1000);
      const maxDateTime = new Date(occurrenceDateTime.getTime() + 48 * 60 * 60 * 1000);
      if (infoDateTime < minDateTime) {
        alert('Information gathered must be at least 24 hours after the occurrence.');
        infoTimeInput.value = '';
        infoTimeInput.focus();
        return;
      }
      if (infoDateTime > maxDateTime) {
        alert('Information gathered must be no later than 48 hours after the occurrence.');
        infoTimeInput.value = '';
        infoTimeInput.focus();
        return;
      }
    }

    occurrenceDateInput.addEventListener('change', () => {
      updateInfoLimits();
      validateInfoDateTime();
    });

    occurrenceTimeInput.addEventListener('change', () => {
      updateInfoLimits();
      validateInfoDateTime();
    });

    infoDateInput.addEventListener('change', () => {
      updateInfoLimits();
      validateInfoDateTime();
    });

    infoTimeInput.addEventListener('change', () => {
      validateInfoDateTime();
    });

    updateInfoLimits();
  }

  setupInfoGatheredValidation(
    document.getElementById('occurrenceDate'),
    document.getElementById('occurrenceTime'),
    document.getElementById('infoGatheredDate'),
    document.getElementById('infoGatheredTime')
  );

  function formatLargeNumber(numStr) {
    let num = BigInt(numStr || "0");
    const trillion = 1_000_000_000_000n;
    const billion = 1_000_000_000n;
    const million = 1_000_000n;
    const thousand = 1_000n;
    if (num >= trillion) return (Number(num) / Number(trillion)).toFixed(2).replace(/\.?0+$/, '') + 'T';
    if (num >= billion) return (Number(num) / Number(billion)).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (num >= million) return (Number(num) / Number(million)).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (num >= thousand) return (Number(num) / Number(thousand)).toFixed(2).replace(/\.?0+$/, '') + 'k';
    return num.toString();
  }

  // Add the submit functionality for the RDANA report
  const nextBtn4 = document.getElementById('nextBtn4');
  if (nextBtn4) {
    nextBtn4.addEventListener('click', () => {
      if (!validatePageInputs('#form-page-4')) {
        Swal.fire({
          icon: 'warning',
          title: 'Incomplete Data',
          text: 'Please fill in all required fields on this page.',
          background: '#fffaf0',
          color: '#92400e',
          iconColor: '#f59e0b',
          confirmButtonColor: '#d97706',
          customClass: {
            popup: 'swal2-popup-warning-clean',
            title: 'swal2-title-warning-clean',
            content: 'swal2-text-warning-clean'
          }
        });
        return;
      }

      const previewDiv = document.getElementById("preview-data");
      previewDiv.innerHTML = "";

      // Page 1 data
      const page1Inputs = document.querySelectorAll("#form-page-1 input, #form-page-1 select");
      let page1Table = `<h3>Profile of the Disaster</h3><div class='table-scroll'><table class='preview-table' id='page1preview'>`;
      profileData = {};
      page1Inputs.forEach(input => {
        const label = input.previousElementSibling ? input.previousElementSibling.innerText : "Field";
        const sanitizedLabel = sanitizeKey(label);
        page1Table += `<tr><td id='page1-tdlabel'>${label}</td><td id='page1-tdinput'>${input.value}</td></tr>`;
        profileData[sanitizedLabel] = input.value;
      });
      page1Table += `</table></div>`;

      // Page 2 data
      summary = document.querySelector("#form-page-2 textarea")?.value || "";
      let page2Table = `<h3>Summary of Disaster/Incident</h3><p>${summary}</p>`;
      const tableRows = document.querySelectorAll("#disasterprofile-table tbody tr");
      page2Table += `<div class='table-scroll'><table class='preview-table' id='page2preview'><tr><th>Community</th><th>Total Pop.</th><th>Affected Pop.</th><th>Deaths</th><th>Injured</th><th>Missing</th><th>Children</th><th>Women</th><th>Seniors</th><th>PWD</th></tr>`;
      affectedCommunities = [];
      tableRows.forEach(row => {
        const cells = row.querySelectorAll("input") || [];
        page2Table += "<tr>";
        const communityData = {
          community: cells[0]?.value || "",
          totalPop: formatLargeNumber(cells[1]?.value) || "0",
          affected: formatLargeNumber(cells[2]?.value) || "0",
          deaths: formatLargeNumber(cells[3]?.value) || "0",
          injured: formatLargeNumber(cells[4]?.value) || "0",
          missing: formatLargeNumber(cells[5]?.value) || "0",
          children: formatLargeNumber(cells[6]?.value) || "0",
          women: formatLargeNumber(cells[7]?.value) || "0",
          seniors: formatLargeNumber(cells[8]?.value) || "0",
          pwd: formatLargeNumber(cells[9]?.value) || "0"
        };
        affectedCommunities.push(communityData);
        cells.forEach((cell, i) => {
          if (i === 0) page2Table += `<td>${cell.value}</td>`;
          else page2Table += `<td>${formatLargeNumber(cell.value)}</td>`;
        });
        page2Table += "</tr>";
      });
      page2Table += "</table></div>";

      // Page 3 data
      const statusRows = document.querySelectorAll("#status-table tbody tr");
      let page3Table = `<h3>Status of Structures</h3><div class='table-scroll'><table class='preview-table' id='page3preview'><tr><th>Structure</th><th>Status</th></tr>`;
      structureStatus = [];
      statusRows.forEach(row => {
        const structure = row.querySelector("td")?.innerText || "";
        let status = "N/A";
        const select = row.querySelector("select");
        const input = row.querySelector("input");
        if (select) {
          const selectedOption = select.selectedOptions[0];
          status = selectedOption && selectedOption.value ? selectedOption.text : "N/A";
        } else if (input) {
          status = input.value.trim() || "N/A";
        }
        page3Table += `<tr><td>${structure}</td><td>${status}</td></tr>`;
        structureStatus.push({ structure, status });
      });
      page3Table += `</table></div>`;

      // Page 4 checklist
      const checklistItems = document.querySelectorAll("#checklist-table input[type='checkbox']");
      let page4Table = `<h3>Initial Needs Assessment</h3><div class='table-scroll'><table class='preview-table' id='page4preview'><tr><th>Item</th><th>Needed</th></tr>`;
      needsChecklist = [];
      checklistItems.forEach(item => {
        const label = item.closest("tr").querySelector("td")?.innerText || "";
        page4Table += `<tr><td>${label}</td><td>${item.checked ? "Yes" : "No"}</td></tr>`;
        needsChecklist.push({ item: label, needed: item.checked });
      });
      page4Table += `</table></div>`;

      // Page 4 additional needs
      otherNeeds = document.querySelector("#form-page-4 input[placeholder='Enter items']")?.value || "N/A";
      estQty = document.querySelector("#form-page-4 input[placeholder='Estimated No. of Families to Benefit']")?.value || "N/A";
      responseGroup = document.querySelector("#form-page-4 input[placeholder='Enter Name of Organization/s']")?.value || "N/A";
      reliefDeployed = document.querySelector("#form-page-4 input[placeholder='Enter Relief Assistance']")?.value || "N/A";
      familiesServed = document.querySelector("#form-page-4 input[placeholder='Enter number of families']")?.value || "N/A";
      page4Table += `
        <p><strong>Other Immediate Needs:</strong> ${otherNeeds}</p>
        <p><strong>Estimated Quantity:</strong> ${estQty}</p>
        <h3 style="margin-top: 15px; margin-bottom: 10px;">Initial Response Actions</h3>
        <p><strong>Response Groups Involved:</strong> ${responseGroup}</p>
        <p><strong>Relief Assistance Deployed:</strong> ${reliefDeployed}</p>
        <p><strong>Number of Families Served:</strong> ${familiesServed}</p>
      `;

      previewDiv.innerHTML = page1Table + page2Table + page3Table + page4Table;
      document.getElementById("form-page-4").style.display = "none";
      document.getElementById("form-page-5").style.display = "block";

      // Submit button logic
      const submitBtn = document.getElementById("submitReportBtn");
      if (submitBtn) {
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        newSubmitBtn.addEventListener("click", (e) => {
          e.preventDefault();
          newSubmitBtn.disabled = true;
          newSubmitBtn.textContent = "Submitting...";

          // NEW: Check if submission is allowed
          if (!canSubmit) {
            Swal.fire({
              icon: 'error',
              title: 'Submission Not Allowed',
              text: 'Your organization is inactive or you lack permission to submit reports.',
              background: '#fdecea',
              color: '#b91c1c',
              iconColor: '#dc2626',
              confirmButtonColor: '#b91c1b',
              timer: 3000,
            });
            newSubmitBtn.disabled = false;
            newSubmitBtn.textContent = "Submit Report";
            return;
          }

          auth.onAuthStateChanged(user => {
            if (!user) {
              Swal.fire({
                icon: 'error',
                title: 'Authentication Required',
                text: 'Please sign in to submit a report.',
              }).then(() => {
                window.location.href = "../pages/login.html";
              });
              newSubmitBtn.disabled = false;
              newSubmitBtn.textContent = "Submit Report";
              return;
            }

            if (!profileData || Object.keys(profileData).length === 0 ||
                !affectedCommunities || affectedCommunities.length === 0 ||
                !needsChecklist || needsChecklist.length === 0) {
              console.error("Form data is incomplete:", { profileData, affectedCommunities, needsChecklist });
              Swal.fire({
                icon: 'error',
                title: 'Submission Failed',
                text: 'Form data is incomplete. Please ensure all fields are filled correctly.',
                background: '#fef2f2',
                color: '#7f1d1d',
                iconColor: '#b91c1c',
                confirmButtonColor: '#991b1b',
                customClass: {
                  popup: 'swal2-popup-error-clean',
                  title: 'swal2-title-error-clean',
                  content: 'swal2-text-error-clean'
                }
              });
              newSubmitBtn.disabled = false;
              newSubmitBtn.textContent = "Submit Report";
              return;
            }

            const reportData = {
              rdanaId: `RDANA-${Math.floor(100 + Math.random() * 900)}`,
              dateTime: new Date().toISOString(),
              rdanaGroup: currentUserGroupName,
              siteLocation: profileData[sanitizeKey("Site Location/Address (Barangay)")] || "N/A",
              disasterType: profileData[sanitizeKey("Type of Disaster")] || "N/A",
              effects: { affectedPopulation: affectedCommunities.reduce((sum, c) => sum + c.affected, 0) },
              needs: { priority: needsChecklist.filter(n => n.needed).map(n => n.item) },
              profile: profileData,
              modality: {
                "Locations_and_Areas_Affected": profileData[sanitizeKey("Locations and Areas Affected (Barangay)")] || "N/A",
                "Type_of_Disaster": profileData[sanitizeKey("Type of Disaster")] || "N/A",
                "Date_and_Time_of_Occurrence": (profileData[sanitizeKey("Date of Occurrence")] + " " + profileData[sanitizeKey("Time of Occurrence")]) || "N/A"
              },
              summary: summary,
              affectedCommunities: affectedCommunities,
              structureStatus: structureStatus,
              needsChecklist: needsChecklist,
              otherNeeds: otherNeeds,
              estQty: estQty,
              responseGroup: responseGroup,
              reliefDeployed: reliefDeployed,
              familiesServed: familiesServed,
              userUid: user.uid,
              status: "Submitted",
              timestamp: firebase.database.ServerValue.TIMESTAMP
            };

            const ref = database.ref("rdana/submitted");
            ref.push(reportData)
              .then(() => {
                console.log("RDANA report saved successfully to rdana/submitted");
                Swal.fire({
                  icon: 'success',
                  title: 'Report Submitted',
                  text: 'Your RDANA report has been submitted for verification!',
                  background: '#e6ffed',
                  color: '#065f46',
                  iconColor: '#10b981',
                  confirmButtonColor: '#059669',
                  timer: 2000,
                  showConfirmButton: false,
                  customClass: {
                    popup: 'swal2-popup-success-clean',
                    title: 'swal2-title-success-clean',
                    content: 'swal2-text-success-clean'
                  }
                }).then(() => {
                  profileData = {};
                  affectedCommunities = [];
                  needsChecklist = [];
                  summary = "";
                  structureStatus = [];
                  otherNeeds = "";
                  estQty = "";
                  responseGroup = "";
                  reliefDeployed = "";
                  familiesServed = "";
                  document.querySelectorAll('input, textarea, select').forEach(input => {
                    if (input.type === 'checkbox') input.checked = false;
                    else input.value = '';
                  });
                  const tableBody = document.getElementById("tableBody");
                  if (tableBody) {
                    tableBody.innerHTML = `
                      <tr>
                        <td><input type="text" placeholder="Enter Municipalities/Communities" required/></td>
                        <td><input type="number" placeholder="Enter Total Population" min="0" required/></td>
                        <td><input type="number" placeholder="Enter Affected Population" min="0" required/></td>
                        <td><input type="number" placeholder="No. of Deaths" min="0" required/></td>
                        <td><input type="number" placeholder="No. of Injured" min="0" required/></td>
                        <td><input type="number" placeholder="No. of Missing" min="0" required/></td>
                        <td><input type="number" placeholder="No. of Children" min="0" required/></td>
                        <td><input type="number" placeholder="No. of Women" min="0" required/></td>
                        <td><input type="number" placeholder="No. of Senior Citizens" min="0" required/></td>
                        <td><input type="number" placeholder="No. of PWD" min="0" required/></td>
                        <td><button type="reset" class="removeRowBtn">Clear</button></td>
                      </tr>
                    `;
                  }
                  document.getElementById("form-page-5").style.display = "none";
                  document.getElementById("form-page-1").style.display = "block";
                });
              })
              .catch(error => {
                console.error("Error saving RDANA report to Firebase:", error);
                Swal.fire({
                  icon: 'error',
                  title: 'Submission Failed',
                  text: 'Failed to submit RDANA report: ' + error.message,
                  background: '#fdecea',
                  color: '#b91c1c',
                  iconColor: '#dc2626',
                  confirmButtonColor: '#b91c1b',
                  timer: 3000,
                  showConfirmButton: true,
                  customClass: {
                    popup: 'swal2-popup-error-clean',
                    title: 'swal2-title-error-clean',
                    content: 'swal2-text-error-clean'
                  }
                });
              })
              .finally(() => {
                newSubmitBtn.disabled = false;
                newSubmitBtn.textContent = "Submit Report";
              });
          });
        });
      }
    });
  }

  // Only add event listeners for search and sort if the elements exist
  if (searchInput && sortSelect) {
    searchInput.addEventListener("input", applySearchAndSort);
    sortSelect.addEventListener("change", applySearchAndSort);
  }

  // Add navigation for other pages (next/back buttons)
  const nextBtn1 = document.getElementById('nextBtn1');
  const nextBtn2 = document.getElementById('nextBtn2');
  const nextBtn3 = document.getElementById('nextBtn3');
  const backBtn2 = document.getElementById('backBtn2');
  const backBtn3 = document.getElementById('backBtn3');
  const backBtn4 = document.getElementById('backBtn4');
  const backBtn5 = document.getElementById('backBtn5');

  if (nextBtn1) {
    nextBtn1.addEventListener('click', () => {
      if (validatePageInputs('#form-page-1')) {
        document.getElementById("form-page-1").style.display = "none";
        document.getElementById("form-page-2").style.display = "block";
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'Incomplete Data',
          text: 'Please fill in all required fields on this page.',
          background: '#fffaf0',
          color: '#92400e',
          iconColor: '#f59e0b',
          confirmButtonColor: '#d97706',
          customClass: {
            popup: 'swal2-popup-warning-clean',
            title: 'swal2-title-warning-clean',
            content: 'swal2-text-warning-clean'
          }
        });
      }
    });
  }

  if (nextBtn2) {
    nextBtn2.addEventListener('click', () => {
      if (validatePageInputs('#form-page-2')) {
        document.getElementById("form-page-2").style.display = "none";
        document.getElementById("form-page-3").style.display = "block";
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'Incomplete Data',
          text: 'Please fill in all required fields on this page.',
          background: '#fffaf0',
          color: '#92400e',
          iconColor: '#f59e0b',
          confirmButtonColor: '#d97706',
          customClass: {
            popup: 'swal2-popup-warning-clean',
            title: 'swal2-title-warning-clean',
            content: 'swal2-text-warning-clean'
          }
        });
      }
    });
  }

  if (nextBtn3) {
    nextBtn3.addEventListener('click', () => {
      if (validatePageInputs('#form-page-3')) {
        document.getElementById("form-page-3").style.display = "none";
        document.getElementById("form-page-4").style.display = "block";
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'Incomplete Data',
          text: 'Please fill in all required fields on this page.',
          background: '#fffaf0',
          color: '#92400e',
          iconColor: '#f59e0b',
          confirmButtonColor: '#d97706',
          customClass: {
            popup: 'swal2-popup-warning-clean',
            title: 'swal2-title-warning-clean',
            content: 'swal2-text-warning-clean'
          }
        });
      }
    });
  }

  if (backBtn2) {
    backBtn2.addEventListener('click', () => {
      document.getElementById("form-page-2").style.display = "none";
      document.getElementById("form-page-1").style.display = "block";
    });
  }

  if (backBtn3) {
    backBtn3.addEventListener('click', () => {
      document.getElementById("form-page-3").style.display = "none";
      document.getElementById("form-page-2").style.display = "block";
    });
  }

  if (backBtn4) {
    backBtn4.addEventListener('click', () => {
      document.getElementById("form-page-4").style.display = "none";
      document.getElementById("form-page-3").style.display = "block";
    });
  }

  if (backBtn5) {
    backBtn5.addEventListener('click', () => {
      document.getElementById("form-page-5").style.display = "none";
      document.getElementById("form-page-4").style.display = "block";
    });
  }

  // Add row functionality
  document.getElementById("addRowBtn").addEventListener('click', function () {
    const tableBody = document.getElementById("tableBody");
    const newRow = document.createElement("tr");
    newRow.innerHTML = `
      <td><input type="text" placeholder="Enter Municipalities/Communities" /></td>
      <td><input type="number" placeholder="Enter Total Population" /></td>
      <td><input type="number" placeholder="Enter Affected Population" /></td>
      <td><input type="number" placeholder="No. of Deaths" /></td>
      <td><input type="number" placeholder="No. of Injured" /></td>
      <td><input type="number" placeholder="No. of Missing" /></td>
      <td><input type="number" placeholder="No. of Children" /></td>
      <td><input type="number" placeholder="No. of Women" /></td>
      <td><input type="number" placeholder="No. of Senior Citizens" /></td>
      <td><input type="number" placeholder="No. of PWD" /></td>
      <td><button type="button" class="deleteRowBtn">Delete</button></td>
    `;
    tableBody.appendChild(newRow);
    const deleteBtns = document.querySelectorAll(".deleteRowBtn");
    deleteBtns.forEach(button => {
      button.addEventListener('click', function () {
        this.closest('tr').remove();
      });
    });
  });

  // Clear row functionality
  const clearBtns = document.querySelectorAll(".removeRowBtn");
  clearBtns.forEach(button => {
    button.addEventListener('click', function () {
      const row = this.closest('tr');
      row.querySelectorAll('input').forEach(input => input.value = '');
    });
  });
});