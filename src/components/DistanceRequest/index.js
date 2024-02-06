import lodashGet from 'lodash/get';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View} from 'react-native';
import {withOnyx} from 'react-native-onyx';
import _ from 'underscore';
import FullPageNotFoundView from '@components/BlockingViews/FullPageNotFoundView';
import Button from '@components/Button';
import DotIndicatorMessage from '@components/DotIndicatorMessage';
import DraggableList from '@components/DraggableList';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import ScreenWrapper from '@components/ScreenWrapper';
import transactionPropTypes from '@components/transactionPropTypes';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import usePrevious from '@hooks/usePrevious';
import useThemeStyles from '@hooks/useThemeStyles';
import * as ErrorUtils from '@libs/ErrorUtils';
import * as IOUUtils from '@libs/IOUUtils';
import Navigation from '@libs/Navigation/Navigation';
import * as TransactionUtils from '@libs/TransactionUtils';
import reportPropTypes from '@pages/reportPropTypes';
import variables from '@styles/variables';
import * as MapboxToken from '@userActions/MapboxToken';
import * as Transaction from '@userActions/Transaction';
import * as TransactionEdit from '@userActions/TransactionEdit';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import DistanceRequestFooter from './DistanceRequestFooter';
import DistanceRequestRenderItem from './DistanceRequestRenderItem';

const propTypes = {
    /** The transactionID of this request */
    transactionID: PropTypes.string,

    /** The report to which the distance request is associated */
    report: reportPropTypes,

    /** Are we editing an existing distance request, or creating a new one? */
    isEditingRequest: PropTypes.bool,

    /** Are we editing the distance while creating a new distance request */
    isEditingNewRequest: PropTypes.bool,

    /** Called on submit of this page */
    onSubmit: PropTypes.func.isRequired,

    /* Onyx Props */
    transaction: transactionPropTypes,

    /** React Navigation route */
    route: PropTypes.shape({
        /** Params from the route */
        params: PropTypes.shape({
            /** The type of IOU report, i.e. bill, request, send */
            iouType: PropTypes.string,

            /** The report ID of the IOU */
            reportID: PropTypes.string,
        }),
    }).isRequired,
};

const defaultProps = {
    transactionID: '',
    report: {},
    isEditingRequest: false,
    isEditingNewRequest: false,
    transaction: {},
};

function DistanceRequest({transactionID, report, transaction, route, isEditingRequest, isEditingNewRequest, onSubmit}) {
    const styles = useThemeStyles();
    const {isOffline} = useNetwork();
    const {translate} = useLocalize();

    const [optimisticWaypoints, setOptimisticWaypoints] = useState(null);
    const [hasError, setHasError] = useState(false);
    const reportID = lodashGet(report, 'reportID', '');
    const waypoints = useMemo(() => optimisticWaypoints || lodashGet(transaction, 'comment.waypoints', {waypoint0: {}, waypoint1: {}}), [optimisticWaypoints, transaction]);
    const waypointsList = _.keys(waypoints);
    const iouType = lodashGet(route, 'params.iouType', '');
    const previousWaypoints = usePrevious(waypoints);
    const numberOfWaypoints = _.size(waypoints);
    const numberOfPreviousWaypoints = _.size(previousWaypoints);
    const scrollViewRef = useRef(null);

    const isLoadingRoute = lodashGet(transaction, 'comment.isLoading', false);
    const isLoading = lodashGet(transaction, 'isLoading', false);
    const hasRouteError = !!lodashGet(transaction, 'errorFields.route');
    const hasRoute = TransactionUtils.hasRoute(transaction);
    const validatedWaypoints = TransactionUtils.getValidWaypoints(waypoints);
    const previousValidatedWaypoints = usePrevious(validatedWaypoints);
    const haveValidatedWaypointsChanged = !_.isEqual(previousValidatedWaypoints, validatedWaypoints);
    const isRouteAbsentWithoutErrors = !hasRoute && !hasRouteError;
    const shouldFetchRoute = (isRouteAbsentWithoutErrors || haveValidatedWaypointsChanged) && !isLoadingRoute && _.size(validatedWaypoints) > 1;
    const transactionWasSaved = useRef(false);

    useEffect(() => {
        MapboxToken.init();
        return MapboxToken.stop;
    }, []);

    useEffect(() => {
        if (!isEditingNewRequest && !isEditingRequest) {
            return () => {};
        }
        // This effect runs when the component is mounted and unmounted. It's purpose is to be able to properly
        // discard changes if the user cancels out of making any changes. This is accomplished by backing up the
        // original transaction, letting the user modify the current transaction, and then if the user ever
        // cancels out of the modal without saving changes, the original transaction is restored from the backup.

        // On mount, create the backup transaction.
        TransactionEdit.createBackupTransaction(transaction);

        return () => {
            // If the user cancels out of the modal without without saving changes, then the original transaction
            // needs to be restored from the backup so that all changes are removed.
            if (transactionWasSaved.current) {
                return;
            }
            TransactionEdit.restoreOriginalTransactionFromBackup(transaction.transactionID);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const transactionWaypoints = lodashGet(transaction, 'comment.waypoints', {});
        if (!lodashGet(transaction, 'transactionID') || !_.isEmpty(transactionWaypoints)) {
            return;
        }

        // Create the initial start and stop waypoints
        Transaction.createInitialWaypoints(transactionID);
        return () => {
            // Whenever we reset the transaction, we need to set errors as empty/false.
            setHasError(false);
        };
    }, [transaction, transactionID]);

    useEffect(() => {
        if (isOffline || !shouldFetchRoute) {
            return;
        }

        Transaction.getRoute(transactionID, validatedWaypoints);
    }, [shouldFetchRoute, transactionID, validatedWaypoints, isOffline]);

    useEffect(() => {
        if (numberOfWaypoints <= numberOfPreviousWaypoints) {
            return;
        }
        scrollViewRef.current.scrollToEnd({animated: true});
    }, [numberOfPreviousWaypoints, numberOfWaypoints]);

    useEffect(() => {
        // Whenever we change waypoints we need to remove the error or it will keep showing the error.
        if (_.isEqual(previousWaypoints, waypoints)) {
            return;
        }
        setHasError(false);
    }, [waypoints, previousWaypoints]);

    const navigateBack = () => {
        Navigation.goBack(isEditingNewRequest ? ROUTES.MONEY_REQUEST_CONFIRMATION.getRoute(iouType, reportID) : ROUTES.HOME);
    };

    /**
     * Takes the user to the page for editing a specific waypoint
     * @param {Number} index of the waypoint to edit
     */
    const navigateToWaypointEditPage = (index) => {
        Navigation.navigate(
            ROUTES.MONEY_REQUEST_STEP_WAYPOINT.getRoute(CONST.IOU.ACTION.EDIT, CONST.IOU.TYPE.REQUEST, transactionID, report.reportID, index, Navigation.getActiveRouteWithoutParams()),
        );
    };

    const getError = () => {
        // Get route error if available else show the invalid number of waypoints error.
        if (hasRouteError) {
            return ErrorUtils.getLatestErrorField(transaction, 'route');
        }

        if (_.size(validatedWaypoints) < 2) {
            return {0: translate('iou.error.atLeastTwoDifferentWaypoints')};
        }
    };

    const updateWaypoints = useCallback(
        ({data}) => {
            if (_.isEqual(waypointsList, data)) {
                return;
            }

            const newWaypoints = {};
            let emptyWaypointIndex = -1;
            _.each(data, (waypoint, index) => {
                newWaypoints[`waypoint${index}`] = lodashGet(waypoints, waypoint, {});
                // Find waypoint that BECOMES empty after dragging
                if (_.isEmpty(newWaypoints[`waypoint${index}`]) && !_.isEmpty(lodashGet(waypoints, `waypoint${index}`, {}))) {
                    emptyWaypointIndex = index;
                }
            });

            setOptimisticWaypoints(newWaypoints);
            Promise.all([Transaction.removeWaypoint(transaction, emptyWaypointIndex, true), Transaction.updateWaypoints(transactionID, newWaypoints, true)]).then(() => {
                setOptimisticWaypoints(null);
            });
        },
        [transactionID, transaction, waypoints, waypointsList],
    );

    const submitWaypoints = useCallback(() => {
        // If there is any error or loading state, don't let user go to next page.
        if (_.size(validatedWaypoints) < 2 || hasRouteError || isLoadingRoute || (isLoading && !isOffline)) {
            setHasError(true);
            return;
        }

        if (isEditingNewRequest || isEditingRequest) {
            transactionWasSaved.current = true;
        }

        onSubmit(waypoints);
    }, [onSubmit, setHasError, hasRouteError, isLoadingRoute, isLoading, validatedWaypoints, waypoints, isEditingNewRequest, isEditingRequest, isOffline]);

    const content = (
        <>
            <View style={styles.flex1}>
                <DraggableList
                    data={waypointsList}
                    keyExtractor={(item) => item}
                    shouldUsePortal
                    onDragEnd={updateWaypoints}
                    scrollEventThrottle={variables.distanceScrollEventThrottle}
                    ref={scrollViewRef}
                    renderItem={({item, drag, isActive, getIndex}) => (
                        <DistanceRequestRenderItem
                            waypoints={waypoints}
                            item={item}
                            onSecondaryInteraction={drag}
                            isActive={isActive}
                            getIndex={getIndex}
                            onPress={navigateToWaypointEditPage}
                            disabled={isLoadingRoute}
                        />
                    )}
                    ListFooterComponent={
                        <DistanceRequestFooter
                            waypoints={waypoints}
                            hasRouteError={hasRouteError}
                            navigateToWaypointEditPage={navigateToWaypointEditPage}
                            transaction={transaction}
                        />
                    }
                />
            </View>
            <View style={[styles.w100, styles.pt2]}>
                {/* Show error message if there is route error or there are less than 2 routes and user has tried submitting, */}
                {((hasError && _.size(validatedWaypoints) < 2) || hasRouteError) && (
                    <DotIndicatorMessage
                        style={[styles.mh4, styles.mv3]}
                        messages={getError()}
                        type="error"
                    />
                )}
                <Button
                    success
                    allowBubble
                    pressOnEnter
                    style={[styles.w100, styles.mb4, styles.ph4, styles.flexShrink0]}
                    onPress={submitWaypoints}
                    text={translate(isEditingRequest ? 'common.save' : 'common.next')}
                    isLoading={!isOffline && (isLoadingRoute || shouldFetchRoute || isLoading)}
                />
            </View>
        </>
    );

    if (!isEditingNewRequest) {
        return content;
    }

    return (
        <ScreenWrapper
            includeSafeAreaPaddingBottom={false}
            shouldEnableKeyboardAvoidingView={false}
            testID={DistanceRequest.displayName}
        >
            {({safeAreaPaddingBottomStyle}) => (
                <FullPageNotFoundView shouldShow={!IOUUtils.isValidMoneyRequestType(iouType)}>
                    <View style={[styles.flex1, safeAreaPaddingBottomStyle]}>
                        <HeaderWithBackButton
                            title={translate('common.distance')}
                            onBackButtonPress={navigateBack}
                        />
                        {content}
                    </View>
                </FullPageNotFoundView>
            )}
        </ScreenWrapper>
    );
}

DistanceRequest.displayName = 'DistanceRequest';
DistanceRequest.propTypes = propTypes;
DistanceRequest.defaultProps = defaultProps;
export default withOnyx({
    transaction: {
        key: ({transactionID}) => `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID || 0}`,
    },
})(DistanceRequest);
